import path from 'node:path';

// The single source of truth for what a library module may be called and how large it may be. The manifest's input
// schemas are pinned to these by tests/manifest.test.mjs.
export const MODULE_NAME_RE = /^[a-z][a-z0-9-]*$/;
export const MODULE_NAME_MAX = 64;
export const DESCRIPTION_MAX = 1000;
export const SOURCE_MAX = 262144;

export const isModuleName = (n) => typeof n === 'string' && n.length <= MODULE_NAME_MAX && MODULE_NAME_RE.test(n);

// Call only after isModuleName: the name is then one safe path segment.
export const moduleFile = (dir, name) => path.join(dir, `${name}.mjs`);
export const sidecarFile = (dir, name) => path.join(dir, `${name}.json`);
