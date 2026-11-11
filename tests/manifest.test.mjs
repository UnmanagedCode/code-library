import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createLibrary } from '../src/library.js';
import { createMcp } from '../src/mcp.js';
import { DESCRIPTION_MAX, MODULE_NAME_MAX, MODULE_NAME_RE, SOURCE_MAX } from '../src/moduleRules.js';
import { checkSchema } from './_jsonSchemaSubset.mjs';
import { ROOT, tmpDir } from './helpers.mjs';

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'conductor.plugin.json'), 'utf8'));
const tools = manifest.mcp.tools;
const member = manifest.runCode.members.find((m) => m.name === 'run');

// The key sets cc's manifest validator accepts (cc docs/plugins.md); any other key makes the plugin invalid.
const TOP = ['id', 'name', 'version', 'pluginApi', 'backend', 'frontend', 'mcp', 'conventions', 'roles', 'playbooks', 'claudePlugin', 'menuItems', 'runCode'];
const BACKEND = ['start', 'healthPath', 'readyWhen'];
const MCP = ['endpoint', 'scope', 'timeoutMs', 'tools'];
const RUNCODE = ['module', 'members'];
const PROP = ['type', 'enum', 'minLength', 'maxLength', 'pattern', 'minimum', 'maximum', 'items', 'description', 'default'];
const SCHEMA = ['type', 'properties', 'required', 'description', 'additionalProperties'];
const TOOL_KEYS = ['name', 'description', 'inputSchema', 'outputSchema'];
const MEMBER_KEYS = ['name', 'description', 'inputSchema', 'outputSchema'];
const MEMBER_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const within = (obj, allowed, where) => { for (const k of Object.keys(obj)) assert.ok(allowed.includes(k), `unknown key '${where}.${k}'`); };

// Invariant: the manifest uses only keys cc accepts, so the plugin never loads as invalid.
test('manifest keys are within the sets cc accepts', () => {
  within(manifest, TOP, '');
  within(manifest.backend, BACKEND, 'backend');
  within(manifest.mcp, MCP, 'mcp');
  within(manifest.runCode, RUNCODE, 'runCode');
  assert.equal(manifest.pluginApi, 1);
  assert.equal(manifest.backend.healthPath, '/api/health');
  for (const t of tools) {
    within(t, TOOL_KEYS, t.name);
    assert.match(t.name, /^[a-zA-Z0-9_-]+$/);
  }
  within(member, MEMBER_KEYS, 'run');
  for (const x of [...tools, member]) {
    within(x.inputSchema, SCHEMA, `${x.name}.inputSchema`);
    assert.equal(x.inputSchema.type, 'object');
    for (const [prop, spec] of Object.entries(x.inputSchema.properties ?? {})) within(spec, PROP, `${x.name}.${prop}`);
  }
});

// Invariant: the run member's name is legal for cc and does not collide with a tool.
test('member name rules', () => {
  for (const m of manifest.runCode.members) {
    assert.match(m.name, MEMBER_NAME);
    assert.ok(!['then', ...Object.getOwnPropertyNames(Object.prototype)].includes(m.name));
    assert.ok(!tools.some((t) => t.name === m.name));
  }
});

// Invariant: every tool outputSchema is in cc's validated subset with an object root; run declares none (cc never validates a member's return).
test('output schemas', () => {
  for (const t of tools) {
    assert.doesNotThrow(() => checkSchema(t.outputSchema), t.name);
    assert.equal(t.outputSchema.type, 'object');
  }
  assert.equal('outputSchema' in member, false);
});

// Invariant: the run module and the claude plugin the manifest points at exist.
test('referenced files exist', () => {
  assert.ok(fs.existsSync(path.join(ROOT, manifest.runCode.module)));
  assert.ok(fs.existsSync(path.join(ROOT, manifest.claudePlugin, '.claude-plugin', 'plugin.json')));
});

// Invariant: the manifest's input bounds are the constants in src/moduleRules.js, the single source of truth.
test('input schemas equal moduleRules constants', () => {
  for (const x of [...tools, member]) {
    const name = x.inputSchema.properties.name;
    if (!name) continue;
    assert.equal(name.pattern, MODULE_NAME_RE.source, x.name);
    assert.equal(name.maxLength, MODULE_NAME_MAX, x.name);
  }
  const save = tools.find((t) => t.name === 'save').inputSchema.properties;
  assert.equal(save.description.maxLength, DESCRIPTION_MAX);
  assert.equal(save.source.maxLength, SOURCE_MAX);
});

// Invariant: the declared tools are exactly the backend's handlers.
test('manifest tools equal handler names', () => {
  const mcp = createMcp({ library: createLibrary({ dir: tmpDir() }) });
  assert.deepEqual([...mcp.toolNames].sort(), tools.map((t) => t.name).sort());
});

// Invariant: run's description names the skill that teaches module writing, and that skill exists under that name.
test('run description names the library-modules skill', () => {
  assert.match(member.description, /code-library:library-modules/);
  const skill = fs.readFileSync(path.join(ROOT, 'claude', 'skills', 'library-modules', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: library-modules\n/);
});
