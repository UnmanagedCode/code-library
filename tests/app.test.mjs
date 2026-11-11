import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createApp } from '../src/app.js';
import { createLibrary } from '../src/library.js';
import { createMcp } from '../src/mcp.js';
import { JSON_HEADERS, listen, postJson, request, tmpDir } from './helpers.mjs';

async function boot() {
  const dir = tmpDir();
  const server = createApp({ mcp: createMcp({ library: createLibrary({ dir, log: { warn() {}, error() {} } }) }), dataDir: dir });
  const port = await listen(server);
  return { dir, port, close: () => server.close() };
}
const SAVE = { tool: 'save', format: 'json', arguments: { name: 'm1', description: 'd', source: 'export default 1;' } };

// Invariant: health reports ok.
test('health', async (t) => {
  const { port, close } = await boot(); t.after(close);
  assert.deepEqual((await request(port, { path: '/api/health' })).json, { ok: true });
});

// Invariant: the library-dir route returns the absolute data dir the store writes to.
test('library-dir returns the data dir', async (t) => {
  const { port, dir, close } = await boot(); t.after(close);
  assert.deepEqual((await request(port, { path: '/api/library-dir' })).json, { dir });
});

// Invariant: any request carrying an Origin is refused with 403 and writes nothing.
test('Origin header is refused and nothing is written', async (t) => {
  const { port, dir, close } = await boot(); t.after(close);
  const r = await request(port, { method: 'POST', path: '/api/mcp', headers: { ...JSON_HEADERS, origin: 'http://evil.example' }, body: SAVE });
  assert.equal(r.status, 403);
  assert.equal((await request(port, { path: '/api/health', headers: { origin: 'http://x' } })).status, 403);
  assert.deepEqual(fs.readdirSync(dir), []);
});

// Invariant: the MCP route needs a JSON content type and caps the body size.
test('415 without JSON content type, 413 past the cap', async (t) => {
  const { port, close } = await boot(); t.after(close);
  assert.equal((await request(port, { method: 'POST', path: '/api/mcp', headers: { 'content-type': 'text/plain' }, body: '{}' })).status, 415);
  const big = JSON.stringify({ pad: 'x'.repeat(2 * 1024 * 1024 + 10) });
  assert.equal((await request(port, { method: 'POST', path: '/api/mcp', headers: JSON_HEADERS, body: big })).status, 413);
});

// Invariant: unknown paths are 404, wrong methods 405.
test('404 and 405', async (t) => {
  const { port, close } = await boot(); t.after(close);
  assert.equal((await request(port, { path: '/nope' })).status, 404);
  assert.equal((await request(port, { path: '/toString' })).status, 404);
  assert.equal((await request(port, { method: 'POST', path: '/api/health', headers: JSON_HEADERS, body: '{}' })).status, 405);
  assert.equal((await request(port, { path: '/api/mcp' })).status, 405);
});

// Invariant: POST /api/mcp executes the tool: a saved module lands on disk.
test('mcp end to end saves a file', async (t) => {
  const { port, dir, close } = await boot(); t.after(close);
  const r = await postJson(port, '/api/mcp', SAVE);
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, { structured: { name: 'm1', replaced: false } });
  assert.equal(fs.readFileSync(`${dir}/m1.mjs`, 'utf8'), 'export default 1;');
});
