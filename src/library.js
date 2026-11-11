import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { CODES, CodedError } from './errors.js';
import { DESCRIPTION_MAX, MODULE_NAME_RE, SOURCE_MAX, isModuleName, moduleFile, sidecarFile } from './moduleRules.js';

const MODULE_FILE_RE = new RegExp(`^(${MODULE_NAME_RE.source.slice(1, -1)})\\.mjs$`);
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function onlyKeys(args, allowed, tool) {
  if (!isPlainObject(args)) throw new CodedError(CODES.BAD_REQUEST, `${tool}: arguments must be an object`);
  for (const k of Object.keys(args)) if (!allowed.includes(k)) throw new CodedError(CODES.BAD_REQUEST, `${tool}: unknown argument '${k}'`);
}

function checkName(name) {
  if (typeof name !== 'string') throw new CodedError(CODES.BAD_REQUEST, 'name must be a string');
  if (!isModuleName(name)) throw new CodedError(CODES.NAME_INVALID, `invalid module name: ${name.slice(0, 80)}`);
}

// The store: the only code that touches the data dir. The backend is its only writer.
export function createLibrary({ dir, log = console }) {
  const chains = new Map();
  // Run `fn` after every earlier operation on the same name has settled.
  function serialized(name, fn) {
    const run = (chains.get(name) ?? Promise.resolve()).catch(() => {}).then(fn);
    const tail = run.catch(() => {});
    chains.set(name, tail);
    tail.then(() => { if (chains.get(name) === tail) chains.delete(name); });
    return run;
  }

  async function writeAtomic(file, text) {
    const tmp = path.join(dir, `.${path.basename(file, path.extname(file))}.${crypto.randomBytes(6).toString('hex')}.tmp`);
    try {
      await fs.promises.writeFile(tmp, text, { mode: 0o600 });
      await fs.promises.rename(tmp, file);
    } catch (e) {
      // Best-effort: a cleanup failure must not replace the write error.
      await fs.promises.rm(tmp, { force: true }).catch(() => {});
      throw e;
    }
  }

  const exists = (file) => fs.promises.access(file).then(() => true, () => false);

  async function readDescription(name) {
    const file = sidecarFile(dir, name);
    try {
      const d = JSON.parse(await fs.promises.readFile(file, 'utf8'))?.description;
      if (typeof d === 'string') return d;
      log.warn(`code-library: ${file} has no string description`);
    } catch (e) {
      log.warn(`code-library: cannot read description ${file}: ${e.code ?? e.message}`);
    }
    return '';
  }

  async function save(args) {
    onlyKeys(args, ['name', 'description', 'source', 'overwrite'], 'save');
    const { name, description, source, overwrite = false } = args;
    checkName(name);
    if (typeof description !== 'string' || description.length < 1 || description.length > DESCRIPTION_MAX) {
      throw new CodedError(CODES.BAD_REQUEST, `description must be a string of 1..${DESCRIPTION_MAX} characters`);
    }
    if (typeof source !== 'string' || source.length < 1 || source.length > SOURCE_MAX) {
      throw new CodedError(CODES.BAD_REQUEST, `source must be a string of 1..${SOURCE_MAX} characters`);
    }
    if (typeof overwrite !== 'boolean') throw new CodedError(CODES.BAD_REQUEST, 'overwrite must be a boolean');
    return serialized(name, async () => {
      const file = moduleFile(dir, name);
      const replaced = await exists(file);
      if (replaced && !overwrite) throw new CodedError(CODES.MODULE_EXISTS, `module ${name} exists; pass overwrite: true to replace it`);
      // Sidecar first, so list never sees a module without its description.
      await writeAtomic(sidecarFile(dir, name), JSON.stringify({ description }));
      await writeAtomic(file, source);
      return { name, replaced };
    });
  }

  async function list(args = {}) {
    onlyKeys(args, [], 'list');
    const names = (await fs.promises.readdir(dir)).map((f) => MODULE_FILE_RE.exec(f)?.[1]).filter(Boolean).sort();
    const modules = [];
    for (const name of names) modules.push({ name, description: await readDescription(name) });
    return { modules };
  }

  async function describe(args) {
    onlyKeys(args, ['name'], 'describe');
    checkName(args.name);
    const { name } = args;
    let source;
    try { source = await fs.promises.readFile(moduleFile(dir, name), 'utf8'); } catch (e) {
      if (e.code === 'ENOENT') throw new CodedError(CODES.MODULE_UNKNOWN, `no module named ${name}`);
      throw e;
    }
    return { name, description: await readDescription(name), source };
  }

  return { save, list, describe };
}
