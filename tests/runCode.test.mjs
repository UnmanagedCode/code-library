import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createApp } from '../src/app.js';
import { createLibrary } from '../src/library.js';
import { createMcp } from '../src/mcp.js';
import factory from '../src/runCode/index.js';
import { listen, tmpDir } from './helpers.mjs';

// A real in-process backend over a fresh library dir, plus `put` to drop module files straight into it.
async function backend(t) {
  const dir = tmpDir();
  const server = createApp({ mcp: createMcp({ library: createLibrary({ dir, log: { warn() {}, error() {} } }) }), dataDir: dir });
  const port = await listen(server);
  t.after(() => server.close());
  return { dir, baseUrl: `http://127.0.0.1:${port}`, put: (name, src) => fs.writeFileSync(path.join(dir, `${name}.mjs`), src) };
}
const code = async (p) => { try { await p; return 'no error'; } catch (e) { return e; } };
const makeCtx = (baseUrl) => ({ pluginId: 'code-library', baseUrl, caller: { sessionId: 's1', project: 'p1' }, cc: { marker: 'cc' } });

// Invariant: building the members touches neither the network nor cc, and exposes exactly {run}.
test('factory does no I/O and returns exactly {run}', async () => {
  let requests = 0;
  const spy = http.createServer((req, res) => { requests += 1; res.end('{}'); });
  const port = await listen(spy);
  try {
    const hostile = new Proxy({}, { get() { throw new Error('cc touched'); }, has() { throw new Error('cc touched'); }, ownKeys() { throw new Error('cc touched'); } });
    const members = factory({ ...makeCtx(`http://127.0.0.1:${port}`), cc: hostile });
    assert.deepEqual(Object.keys(members), ['run']);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(requests, 0);
    assert.throws(() => factory({ ...makeCtx(null), cc: undefined }), TypeError);
  } finally { spy.close(); }
});

// Invariant: the default export is called with (args, {cc, caller}) — the very objects from ctx — and args default to {}.
test('contract call passes args, cc and caller by identity', async (t) => {
  const b = await backend(t);
  b.put('echo', 'export default async (args, ctx) => ({ args, ctx });');
  const ctx = makeCtx(b.baseUrl);
  const { run } = factory(ctx);
  const given = { x: 1 };
  const r = await run({ name: 'echo', args: given });
  assert.equal(r.args, given);
  assert.equal(r.ctx.cc, ctx.cc);
  assert.equal(r.ctx.caller, ctx.caller);
  assert.deepEqual((await run({ name: 'echo' })).args, {});
});

// Invariant: the module's result comes back unchanged, live objects by identity.
test('result is returned by identity', async (t) => {
  const b = await backend(t);
  b.put('live', 'export default async (a, { cc }) => ({ fn() { return 7; }, cc });');
  const ctx = makeCtx(b.baseUrl);
  const r = await factory(ctx).run({ name: 'live' });
  assert.equal(r.fn(), 7);
  assert.equal(r.cc, ctx.cc);
});

// Invariant: a module may import a sibling saved in the library.
test('sibling import works', async (t) => {
  const b = await backend(t);
  b.put('helper', 'export const twice = (n) => n * 2;');
  b.put('main', "import { twice } from './helper.mjs'; export default async ({ n }) => twice(n);");
  assert.equal(await factory(makeCtx(b.baseUrl)).run({ name: 'main', args: { n: 4 } }), 8);
});

// Invariant: an absent module is MODULE_UNKNOWN and an invalid name NAME_INVALID.
test('MODULE_UNKNOWN and NAME_INVALID', async (t) => {
  const b = await backend(t);
  const { run } = factory(makeCtx(b.baseUrl));
  assert.equal((await code(run({ name: 'nope' }))).code, 'MODULE_UNKNOWN');
  for (const name of ['../x', 'A', undefined]) assert.equal((await code(run({ name }))).code, 'NAME_INVALID');
});

// Invariant: a module that fails to import is MODULE_LOAD_FAILED naming the module and carrying the original error.
test('syntax error is MODULE_LOAD_FAILED with name and cause', async (t) => {
  const b = await backend(t);
  b.put('broken', 'export default (');
  const e = await code(factory(makeCtx(b.baseUrl)).run({ name: 'broken' }));
  assert.equal(e.code, 'MODULE_LOAD_FAILED');
  assert.match(e.message, /^broken: SyntaxError: /);
  assert.ok(e.cause instanceof SyntaxError);
});

// Invariant: a broken sibling fails only the modules importing it; other modules still run from the same factory.
test('broken sibling isolation', async (t) => {
  const b = await backend(t);
  b.put('bad-b', 'export default (');
  b.put('a', "import './bad-b.mjs'; export default () => 1;");
  b.put('c', 'export default () => "fine";');
  const { run } = factory(makeCtx(b.baseUrl));
  assert.equal((await code(run({ name: 'a' }))).code, 'MODULE_LOAD_FAILED');
  assert.equal(await run({ name: 'c' }), 'fine');
});

// Invariant: a module without a function default export is MODULE_NOT_FUNCTION.
test('MODULE_NOT_FUNCTION', async (t) => {
  const b = await backend(t);
  b.put('num', 'export default 42;');
  b.put('nodef', 'export const x = 1;');
  const { run } = factory(makeCtx(b.baseUrl));
  assert.equal((await code(run({ name: 'num' }))).code, 'MODULE_NOT_FUNCTION');
  assert.equal((await code(run({ name: 'nodef' }))).code, 'MODULE_NOT_FUNCTION');
});

// Invariant: a module's own throw reaches the program as the same object with its own code.
test('module throw passes through unchanged', async (t) => {
  const b = await backend(t);
  const marker = Object.assign(new Error('mine'), { code: 'MY_CODE' });
  b.put('thrower', 'export default async (a, { cc }) => { throw cc.err; };');
  const ctx = { ...makeCtx(b.baseUrl) };
  ctx.cc = { err: marker };
  const e = await code(factory(ctx).run({ name: 'thrower' }));
  assert.equal(e, marker);
  assert.equal(e.code, 'MY_CODE');
});

// Invariant: when the library dir cannot be had, run fails LIBRARY_UNAVAILABLE.
test('LIBRARY_UNAVAILABLE for null baseUrl, HTTP 500, malformed body and an unreachable port', async () => {
  const spy = http.createServer((req, res) => { res.statusCode = req.url.startsWith('/bad/') ? 200 : 500; res.end(req.url.startsWith('/bad/') ? '{"dir":5}' : 'no'); });
  const port = await listen(spy);
  try {
    const dead = http.createServer();
    const deadPort = await listen(dead);
    await new Promise((r) => dead.close(r));
    for (const baseUrl of [null, `http://127.0.0.1:${port}`, `http://127.0.0.1:${port}/bad`, `http://127.0.0.1:${deadPort}`]) {
      const e = await code(factory(makeCtx(baseUrl)).run({ name: 'any' }));
      assert.equal(e.code, 'LIBRARY_UNAVAILABLE', String(baseUrl));
    }
  } finally { spy.close(); }
});

// Invariant: the dir is fetched once per factory across runs, and a failed lookup is retried by the next run.
test('dir lookup is memoized on success and retried after failure', async (t) => {
  const b = await backend(t);
  b.put('one', 'export default () => 1;');
  let hits = 0;
  let fail = true;
  const proxy = http.createServer((req, res) => {
    hits += 1;
    if (fail) { res.statusCode = 503; res.end('down'); return; }
    res.end(JSON.stringify({ dir: b.dir }));
  });
  const port = await listen(proxy);
  t.after(() => proxy.close());
  const { run } = factory(makeCtx(`http://127.0.0.1:${port}`));
  assert.equal((await code(run({ name: 'one' }))).code, 'LIBRARY_UNAVAILABLE');
  fail = false;
  assert.equal(await run({ name: 'one' }), 1);
  assert.equal(await run({ name: 'one' }), 1);
  assert.equal(hits, 2);
});
