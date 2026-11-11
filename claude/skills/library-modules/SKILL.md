---
name: library-modules
description: Use when a run_code program repeats a digest or action worth keeping, or to find, read, save or run a Code Library module (code-library__save, code-library__list, code-library__describe, cc.code_library.run).
---

# Code Library modules

A module is a saved JavaScript file that any later `run_code` program runs with `cc.code_library.run`.

## When to save

- Save a program you have written twice, or one a recurring task needs.
- Check `list()` first; adapt an existing module with `describe()` and save under a new name, or `overwrite: true`.

## Module contract

```js
export default async (args, { cc, caller }) => result;
```

- Destructure the second argument; it may gain fields.
- `cc` is the calling program's `cc`: same session, same tool gate.
- `caller` is `{sessionId, project}`.
- `args` defaults to `{}`.
- Return any value. A JSON-able value is what the program returns as its digest; a live object (function, client) is fine for the program to use.

## Imports

- Siblings as `./<name>.mjs`; they must be saved too.
- `node:` built-ins.
- No npm packages: a bare specifier fails as `MODULE_LOAD_FAILED`.
- No top-level I/O or throws: a top-level throw makes the module unloadable.

## Names

- Lowercase letters, digits and `-`, starting with a letter, at most 64 characters (rule: `MODULE_NAME_RE` in `src/moduleRules.js`).
- `save` refuses an existing name (`MODULE_EXISTS`) unless `overwrite: true`. There is no delete.

## Examples

```js
await cc.code_library.save({ name: 'pr-digest', description: 'Digest of open PRs; args {project}',
  source: "export default async ({ project }, { cc }) => ({ project })" });

(await cc.code_library.list()).modules.filter(m => /pr/.test(m.description));

const out = await cc.code_library.run({ name: 'pr-digest', args: { project: 'x' } });
```

A module importing a sibling (save `helper` first):

```js
import { twice } from './helper.mjs';
export default async ({ n }) => twice(n);
```

## Errors

| `code` | Meaning | Do |
|---|---|---|
| `ARGS_INVALID` | cc rejected the arguments (bad name pattern, missing field) | fix the call |
| `MODULE_EXISTS` | `save` on a taken name | pass `overwrite: true` or pick another name |
| `MODULE_UNKNOWN` | no such module | `list()` |
| `MODULE_LOAD_FAILED` | import threw: syntax error, broken or missing sibling, bare npm specifier, top-level throw | read the message (names the module); `describe()` and re-save |
| `MODULE_NOT_FUNCTION` | no default export, or not a function | export a function as default |
| `LIBRARY_UNAVAILABLE` | the backend could not be reached | retry; check the plugin is enabled |

The module's own throws pass through unchanged.

## Limits

- Within one program a module is imported once: a re-saved module takes effect in the next program.
- Source is not syntax-checked at save; errors appear at `run`.
- In plan mode `save` still works (the backend writes), but a module's own file writes are denied; a module that must write goes through a tool.
