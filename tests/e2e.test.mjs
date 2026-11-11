import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { postJson, request, startServer, tmpDir, ROOT } from './helpers.mjs';

// Invariant: the live path minus cc works — save and list through the real server process, then run through the run module.
test('save, list, run against a spawned server', async (t) => {
  const s = await startServer({ dataDir: path.join(tmpDir(), 'data') });
  t.after(() => s.stop());
  const saved = await postJson(s.port, '/api/mcp', { tool: 'save', format: 'json', caller: {}, arguments: { name: 'smoke-echo', description: 'echo', source: 'export default async (args, { caller }) => ({ args, caller });' } });
  assert.deepEqual(saved.json, { structured: { name: 'smoke-echo', replaced: false } });
  const listed = await postJson(s.port, '/api/mcp', { tool: 'list', format: 'json', arguments: {} });
  assert.ok(listed.json.structured.modules.some((m) => m.name === 'smoke-echo'));
  assert.equal((await request(s.port, { path: '/api/library-dir' })).status, 200);

  const { default: factory } = await import(pathToFileURL(path.join(ROOT, 'src', 'runCode', 'index.js')).href);
  const caller = { sessionId: 'sess', project: 'proj' };
  const out = await factory({ pluginId: 'code-library', baseUrl: `http://127.0.0.1:${s.port}`, caller, cc: {} }).run({ name: 'smoke-echo', args: { x: 1 } });
  assert.deepEqual(out, { args: { x: 1 }, caller });
});
