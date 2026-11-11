import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CODES, CodedError } from '../errors.js';
import { isModuleName, moduleFile } from '../moduleRules.js';

// The run_code module: cc calls this factory once per run with ctx = {pluginId, baseUrl, caller, cc}. It does no I/O
// (a failure here fails every member); the library dir is looked up, and modules imported, only inside run.
export default function codeLibraryMembers(ctx) {
  const cc = ctx?.cc;
  if (cc === null || (typeof cc !== 'object' && typeof cc !== 'function')) throw new TypeError('code-library: ctx.cc is missing');
  const { caller, baseUrl } = ctx;

  // Memoized on success only: a failed lookup is retried by the next run.
  let dirPromise = null;
  async function lookupDir() {
    if (typeof baseUrl !== 'string') throw new CodedError(CODES.LIBRARY_UNAVAILABLE, 'the plugin backend is not available (no baseUrl)');
    let res;
    try {
      res = await fetch(new URL('api/library-dir', `${baseUrl.replace(/\/+$/, '')}/`));
    } catch (e) {
      throw new CodedError(CODES.LIBRARY_UNAVAILABLE, `library dir lookup failed: ${e?.cause?.code ?? e?.message ?? e}`, { cause: e });
    }
    if (res.status !== 200) throw new CodedError(CODES.LIBRARY_UNAVAILABLE, `library dir lookup answered HTTP ${res.status}`);
    let body;
    try { body = await res.json(); } catch { body = null; }
    if (typeof body?.dir !== 'string' || body.dir === '') throw new CodedError(CODES.LIBRARY_UNAVAILABLE, 'library dir lookup answered a malformed body');
    return body.dir;
  }
  function libraryDir() {
    if (!dirPromise) {
      dirPromise = lookupDir();
      dirPromise.catch(() => { dirPromise = null; });
    }
    return dirPromise;
  }

  return {
    async run({ name, args } = {}) {
      if (!isModuleName(name)) throw new CodedError(CODES.NAME_INVALID, `invalid module name: ${String(name).slice(0, 80)}`);
      const file = moduleFile(await libraryDir(), name);
      try { await fs.promises.access(file); } catch { throw new CodedError(CODES.MODULE_UNKNOWN, `no module named ${name}`); }
      let mod;
      try {
        mod = await import(pathToFileURL(file).href);
      } catch (e) {
        throw new CodedError(CODES.MODULE_LOAD_FAILED, `${name}: ${e?.name ?? 'Error'}: ${e?.message ?? e}`, { cause: e });
      }
      if (typeof mod.default !== 'function') throw new CodedError(CODES.MODULE_NOT_FUNCTION, `${name} has no function default export`);
      // The result and any throw reach the program unchanged.
      return mod.default(args ?? {}, { cc, caller });
    },
  };
}
