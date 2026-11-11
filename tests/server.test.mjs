import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { SERVER_SCRIPT, request, scrubbedEnv, startServer, tmpDir, waitForExit } from './helpers.mjs';

// Invariant: the server binds loopback, creates a missing data dir owner-only, and answers health.
test('boots on 127.0.0.1 and creates the data dir 0700', async (t) => {
  const dataDir = path.join(tmpDir(), 'nested', 'data');
  const s = await startServer({ dataDir });
  t.after(() => s.stop());
  assert.equal(s.address, '127.0.0.1');
  assert.equal(fs.statSync(dataDir).mode & 0o777, 0o700);
  assert.deepEqual((await request(s.port, { path: '/api/health' })).json, { ok: true });
});

// Invariant: without CONDUCTOR_PLUGIN_DATA_DIR the server exits non-zero naming the variable.
test('unset data dir exits non-zero naming the variable', async () => {
  const proc = spawn(process.execPath, [SERVER_SCRIPT], { stdio: ['ignore', 'pipe', 'pipe'], env: scrubbedEnv({ PORT: '0' }) });
  let out = '';
  proc.stderr.on('data', (d) => { out += d; });
  assert.notEqual(await waitForExit(proc, 10_000), 0);
  assert.match(out, /CONDUCTOR_PLUGIN_DATA_DIR/);
});
