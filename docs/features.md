# Features

| Call | Does |
|---|---|
| `cc.code_library.save({name, description, source, overwrite?})` | Stores a module; refuses an existing name unless `overwrite: true`. |
| `cc.code_library.list()` | `{modules: [{name, description}]}`, sorted by name. |
| `cc.code_library.describe({name})` | `{name, description, source}`. |
| `cc.code_library.run({name, args})` | Imports the module, calls its default export, returns the result unchanged. |

Module contract: `export default async (args, { cc, caller }) => result`. Modules may import siblings as `./<name>.mjs` and `node:` built-ins. The `code-library:library-modules` skill teaches workers this contract.

## Examples

```js
await cc.code_library.save({ name: 'echo', description: 'echoes args and caller',
  source: 'export default async (args, { caller }) => ({ args, caller })' });
const hits = (await cc.code_library.list()).modules.filter((m) => /echo/.test(m.description));
const out = await cc.code_library.run({ name: 'echo', args: { x: 1 } });
```

Text-format results (`format: "text"`): `save` → `saved <name>` / `replaced <name>`; `list` → one `name — description` line each or `no modules saved`; `describe` → the source with `{name, description}` as meta.
