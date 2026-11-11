import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { isModuleName, moduleFile, MODULE_NAME_MAX } from '../src/moduleRules.js';

const GOOD = ['a', 'pr-digest', 'x9', 'a'.repeat(MODULE_NAME_MAX)];
const BAD = ['', 'A', '-a', '9a', 'a_b', 'a.b', 'a/b', '..', '.a', 'a b', 'a'.repeat(MODULE_NAME_MAX + 1), 1, null, undefined, {}, ['a']];

// Invariant: exactly the lowercase letter-led names of letters, digits and '-' up to the maximum length are module names.
test('accepted and refused names', () => {
  for (const n of GOOD) assert.equal(isModuleName(n), true, String(n));
  for (const n of BAD) assert.equal(isModuleName(n), false, String(n));
});

// Invariant: an accepted name always maps to one <name>.mjs file directly inside the library dir.
test('moduleFile stays one segment inside the dir', () => {
  const d = path.join(path.sep, 'lib');
  for (const n of GOOD) {
    const f = moduleFile(d, n);
    assert.equal(path.basename(f), `${n}.mjs`);
    assert.equal(path.dirname(f), d);
  }
});
