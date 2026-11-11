import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createLibrary } from '../src/library.js';
import { tmpDir } from './helpers.mjs';

const quietLog = () => { const warns = []; return { warns, warn: (m) => warns.push(m), error() {} }; };
const setup = () => { const dir = tmpDir(); const log = quietLog(); return { dir, log, lib: createLibrary({ dir, log }) }; };
const mod = (extra = {}) => ({ name: 'pr-digest', description: 'digest of PRs', source: 'export default async () => 1;\n', ...extra });
const code = async (p) => { try { await p; return 'no error'; } catch (e) { return e.code; } };

// Invariant: describe returns exactly the source and description that save stored.
test('save then describe round-trips source and description', async () => {
  const { lib } = setup();
  assert.deepEqual(await lib.save(mod()), { name: 'pr-digest', replaced: false });
  assert.deepEqual(await lib.describe({ name: 'pr-digest' }), { name: 'pr-digest', description: 'digest of PRs', source: 'export default async () => 1;\n' });
});

// Invariant: a save without overwrite never changes an existing module or its description.
test('second save without overwrite is MODULE_EXISTS and leaves files byte-identical', async () => {
  const { lib, dir } = setup();
  await lib.save(mod());
  const before = ['pr-digest.mjs', 'pr-digest.json'].map((f) => fs.readFileSync(path.join(dir, f)));
  assert.equal(await code(lib.save(mod({ source: 'export default 2;', description: 'other' }))), 'MODULE_EXISTS');
  const after = ['pr-digest.mjs', 'pr-digest.json'].map((f) => fs.readFileSync(path.join(dir, f)));
  assert.deepEqual(after, before);
});

// Invariant: overwrite:true replaces module and description and reports replaced:true.
test('overwrite replaces both files', async () => {
  const { lib } = setup();
  await lib.save(mod());
  assert.deepEqual(await lib.save(mod({ source: 'export default 2;', description: 'new', overwrite: true })), { name: 'pr-digest', replaced: true });
  assert.deepEqual(await lib.describe({ name: 'pr-digest' }), { name: 'pr-digest', description: 'new', source: 'export default 2;' });
});

// Invariant: list is sorted by name and shows only well-formed module files.
test('list is sorted and ignores sidecars, temp files, bad names and other files', async () => {
  const { lib, dir } = setup();
  await lib.save(mod({ name: 'zeta', description: 'z' }));
  await lib.save(mod({ name: 'alpha', description: 'a' }));
  fs.writeFileSync(path.join(dir, '.alpha.123.tmp'), 'x');
  fs.writeFileSync(path.join(dir, 'Bad.mjs'), 'x');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
  assert.deepEqual(await lib.list(), { modules: [{ name: 'alpha', description: 'a' }, { name: 'zeta', description: 'z' }] });
});

// Invariant: a hand-placed module without a sidecar is still listed (empty description) and the degradation is logged once.
test('module without sidecar lists with empty description and one warning', async () => {
  const { lib, dir, log } = setup();
  fs.writeFileSync(path.join(dir, 'loose.mjs'), 'export default 1;');
  assert.deepEqual(await lib.list(), { modules: [{ name: 'loose', description: '' }] });
  assert.equal(log.warns.length, 1);
  assert.match(log.warns[0], /loose/);
});

// Invariant: describing a name with no module is MODULE_UNKNOWN.
test('describe of an unknown name', async () => {
  const { lib } = setup();
  assert.equal(await code(lib.describe({ name: 'nope' })), 'MODULE_UNKNOWN');
});

// Invariant: an invalid name is refused before any file is created.
test('invalid name is NAME_INVALID and creates nothing', async () => {
  const { lib, dir } = setup();
  for (const name of ['../x', 'A', 'a b']) assert.equal(await code(lib.save(mod({ name }))), 'NAME_INVALID');
  assert.equal(await code(lib.describe({ name: '../x' })), 'NAME_INVALID');
  assert.deepEqual(fs.readdirSync(dir), []);
});

// Invariant: unknown keys and wrong types are BAD_REQUEST and write nothing.
test('unknown key or wrong type is BAD_REQUEST', async () => {
  const { lib, dir } = setup();
  assert.equal(await code(lib.save(mod({ extra: 1 }))), 'BAD_REQUEST');
  assert.equal(await code(lib.save(mod({ source: 5 }))), 'BAD_REQUEST');
  assert.equal(await code(lib.save(mod({ description: '' }))), 'BAD_REQUEST');
  assert.equal(await code(lib.save(mod({ overwrite: 'yes' }))), 'BAD_REQUEST');
  assert.equal(await code(lib.describe({ name: 'a', extra: 1 })), 'BAD_REQUEST');
  assert.equal(await code(lib.save(null)), 'BAD_REQUEST');
  assert.deepEqual(fs.readdirSync(dir), []);
});

// Invariant: concurrent saves of one new name without overwrite let exactly one win.
test('concurrent saves: one succeeds, one MODULE_EXISTS', async () => {
  const { lib } = setup();
  const results = await Promise.allSettled([lib.save(mod()), lib.save(mod({ description: 'second' }))]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const rejected = results.find((r) => r.status === 'rejected');
  assert.equal(rejected.reason.code, 'MODULE_EXISTS');
});

// Invariant: no temp file survives a save or a refused save, and stored files are owner-only.
test('no .tmp left behind; files are mode 0600', async () => {
  const { lib, dir } = setup();
  await lib.save(mod());
  await code(lib.save(mod()));
  assert.deepEqual(fs.readdirSync(dir).sort(), ['pr-digest.json', 'pr-digest.mjs']);
  for (const f of fs.readdirSync(dir)) assert.equal(fs.statSync(path.join(dir, f)).mode & 0o777, 0o600);
});

// Invariant: the description sidecar is written before the module, so a save that fails at the module write has already stored the sidecar and list never sees a module without one.
test('sidecar is written before the module', async () => {
  const { lib, dir } = setup();
  // A directory where the module file belongs makes the module write (rename) fail, after the sidecar write.
  fs.mkdirSync(path.join(dir, 'pr-digest.mjs'));
  await assert.rejects(lib.save(mod({ overwrite: true })));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'pr-digest.json'), 'utf8')), { description: 'digest of PRs' });
  assert.ok(!fs.readdirSync(dir).some((f) => f.endsWith('.tmp')));
});
