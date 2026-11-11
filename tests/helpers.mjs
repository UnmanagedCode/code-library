import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

export const ROOT = new URL('..', import.meta.url).pathname;
export const SERVER_SCRIPT = path.join(ROOT, 'server.js');

// A fresh temp dir, removed when this test process exits.
const tmpDirs = [];
process.on('exit', () => { for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true }); });
export function tmpDir(prefix = 'code-library-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Poll until `fn` returns truthy. Short steps and a hard cap keep failures fast.
export async function waitFor(fn, { timeout = 3000, step = 20, what = 'condition' } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await sleep(step);
  }
}

// Raw request with full control of Origin/Content-Type (fetch forbids some headers).
export function request(port, { method = 'GET', path: p = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json;
        try { json = JSON.parse(text); } catch { json = undefined; }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

export const JSON_HEADERS = { 'content-type': 'application/json' };
export const postJson = (port, p, body = {}) => request(port, { method: 'POST', path: p, headers: JSON_HEADERS, body });

// Listen on 127.0.0.1:0; resolves with the bound port. Closed when the test process exits.
export function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve(port);
    });
  });
}

// --- child processes ---------------------------------------------------------------------------------------

const children = new Set();
process.on('exit', () => { for (const c of children) try { c.kill('SIGKILL'); } catch { /* gone */ } });
function track(child) {
  children.add(child);
  child.once('exit', () => children.delete(child));
  return child;
}

// This process's environment minus anything that could point a spawned server at a real cc or projects root.
export function scrubbedEnv(extra = {}) {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k === 'PROJECTS_ROOT' || k === 'PORT' || k.startsWith('CONDUCTOR_')) delete env[k];
  }
  return { ...env, ...extra };
}

// server.js on an ephemeral port (PORT=0) with a scratch data dir. The port is read from its own `listening on` line.
export async function startServer({ dataDir, env = {} }) {
  const childEnv = scrubbedEnv({ PORT: '0', CONDUCTOR_PLUGIN_DATA_DIR: dataDir, ...env });
  if (childEnv.PROJECTS_ROOT) throw new Error('startServer: PROJECTS_ROOT must not reach a test server');
  const proc = track(spawn(process.execPath, [SERVER_SCRIPT], { stdio: ['ignore', 'pipe', 'pipe'], env: childEnv }));
  let out = '';
  proc.stdout.on('data', (d) => { out += d; });
  proc.stderr.on('data', (d) => { out += d; });
  const exited = () => proc.exitCode !== null || proc.signalCode !== null;
  const m = await waitFor(() => /code-library listening on ([\d.:a-f]+):(\d+) /.exec(out) || exited(), { what: 'the server to listen', timeout: 10_000 });
  if (m === true) throw new Error(`the server exited: ${out}`);
  const end = (signal) => new Promise((r) => { if (exited()) r(); else { proc.once('exit', r); proc.kill(signal); } });
  return { proc, address: m[1], port: Number(m[2]), log: () => out, stop: () => end('SIGTERM') };
}

// Resolves with the exit code once `proc` has closed; after `ms` it SIGKILLs `proc` and rejects.
export function waitForExit(proc, ms, what = 'the process') {
  return new Promise((resolve, reject) => {
    if (proc.exitCode !== null || proc.signalCode !== null) { resolve(proc.exitCode); return; }
    const timer = setTimeout(() => { proc.kill('SIGKILL'); reject(new Error(`${what} did not exit within ${ms} ms`)); }, ms);
    proc.once('close', (code) => { clearTimeout(timer); resolve(code); });
  });
}
