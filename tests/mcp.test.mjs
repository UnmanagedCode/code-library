import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createLibrary } from '../src/library.js';
import { createMcp } from '../src/mcp.js';
import { validate } from './_jsonSchemaSubset.mjs';
import { tmpDir } from './helpers.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../conductor.plugin.json', import.meta.url), 'utf8'));
const outputSchema = (n) => manifest.mcp.tools.find((t) => t.name === n).outputSchema;
const setup = () => createMcp({ library: createLibrary({ dir: tmpDir(), log: { warn() {}, error() {} } }) });
const SAVE = { name: 'm1', description: 'd', source: 'export default 1;' };
const call = (mcp, tool, args, format = 'json') => mcp.handle({ tool, arguments: args, caller: { sessionId: 's', project: 'p' }, format });

// Invariant: a json reply is exactly {structured}, valid against the tool's manifest outputSchema, for every tool.
test('json replies are {structured} and match each outputSchema', async () => {
  const mcp = setup();
  const replies = { save: await call(mcp, 'save', SAVE), list: await call(mcp, 'list', {}), describe: await call(mcp, 'describe', { name: 'm1' }) };
  for (const [tool, r] of Object.entries(replies)) {
    assert.deepEqual(Object.keys(r), ['structured'], tool);
    assert.doesNotThrow(() => validate(outputSchema(tool), r.structured), tool);
  }
});

// Invariant: a text reply carries only {text, meta?}.
test('text replies', async () => {
  const mcp = setup();
  assert.deepEqual(await call(mcp, 'save', SAVE, 'text'), { text: 'saved m1' });
  assert.deepEqual(await call(mcp, 'save', { ...SAVE, overwrite: true }, 'text'), { text: 'replaced m1' });
  assert.deepEqual(await call(mcp, 'list', {}, 'text'), { text: 'm1 — d' });
  assert.deepEqual(await call(mcp, 'describe', { name: 'm1' }, 'text'), { meta: { name: 'm1', description: 'd' }, text: 'export default 1;' });
  assert.deepEqual(await call(setup(), 'list', {}, 'text'), { text: 'no modules saved' });
  for (const r of [await call(mcp, 'list', {}, 'text')]) for (const k of Object.keys(r)) assert.ok(['text', 'meta'].includes(k));
});

// Invariant: every refusal is {error, code} with a cc-valid code.
test('refusals carry error and a valid code', async () => {
  const mcp = setup();
  await call(mcp, 'save', SAVE);
  const cases = [
    [await call(mcp, 'save', SAVE), 'MODULE_EXISTS'],
    [await call(mcp, 'describe', { name: 'zz' }), 'MODULE_UNKNOWN'],
    [await call(mcp, 'nope', {}), 'TOOL_UNKNOWN'],
    [await call(mcp, 'toString', {}), 'TOOL_UNKNOWN'],
    [await mcp.handle({ tool: 'list', arguments: {}, format: 'xml' }), 'FORMAT_UNKNOWN'],
    [await call(mcp, 'list', 'str'), 'BAD_REQUEST'],
    [await call(mcp, 'list', [1]), 'BAD_REQUEST'],
    [await call(mcp, 'describe', { name: 'A' }), 'NAME_INVALID'],
  ];
  for (const [r, code] of cases) {
    assert.deepEqual(Object.keys(r).sort(), ['code', 'error']);
    assert.equal(r.code, code);
    assert.match(r.code, /^[A-Z][A-Z0-9_]*$/);
  }
});

// Invariant: an unexpected throw is INTERNAL, carries the message and never a stack.
test('unexpected failure is INTERNAL without a stack', async () => {
  const orig = console.error;
  console.error = () => {};
  try {
    const mcp = createMcp({ library: { save() { throw new Error('boom'); }, list() {}, describe() {} } });
    const r = await call(mcp, 'save', SAVE);
    assert.equal(r.code, 'INTERNAL');
    assert.match(r.error, /boom/);
    assert.doesNotMatch(r.error, /\n\s+at /);
  } finally { console.error = orig; }
});

