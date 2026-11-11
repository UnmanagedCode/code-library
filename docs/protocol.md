# Protocol

## Tools (typed, backend `POST /api/mcp`)

| Tool | Input | Output (`structured`) |
|---|---|---|
| `save` | `name`, `description`, `source`, `overwrite?` | `{name, replaced}` |
| `list` | none | `{modules: [{name, description}]}` (object-wrapped: cc requires object replies) |
| `describe` | `name` | `{name, description, source}` |

Bounds (`MODULE_NAME_RE`, `MODULE_NAME_MAX`, `DESCRIPTION_MAX`, `SOURCE_MAX`) live in `src/moduleRules.js`; the manifest schemas are pinned to them by `tests/manifest.test.mjs`. Reply shape follows cc's typed-tool wire: `{structured}` (json), `{text, meta?}` (text), `{error, code}`.

## run_code member `run`

`cc.code_library.run({name, args})` → imports `<name>.mjs`, calls its default export with `(args ?? {}, {cc, caller})`, returns the result and any throw unchanged. It declares no `outputSchema`. Implemented by `src/runCode/index.js`; the factory does no I/O.

## HTTP routes (127.0.0.1)

| Route | Reply |
|---|---|
| `GET /api/health` | `{ok:true}` |
| `POST /api/mcp` | cc wire reply; 415 without JSON content type, 413 past `MAX_BODY_BYTES` |
| `GET /api/library-dir` | `{dir}`: the absolute store dir, used by the run member |

Any request with an `Origin` header → 403. Unknown path 404, wrong method 405, malformed target 400.

## Refusal codes (`CODES` in `src/errors.js`)

| Code | Raised by | When |
|---|---|---|
| `ARGS_INVALID` | cc | schema violation, before forwarding or loading |
| `BAD_REQUEST` | backend | non-object arguments, unknown key, wrong type |
| `NAME_INVALID` | backend, `run` | name fails `isModuleName` |
| `MODULE_EXISTS` | `save` | module exists and `overwrite` is not `true` |
| `MODULE_UNKNOWN` | `describe`, `run` | no such module |
| `MODULE_LOAD_FAILED` | `run` | `import()` threw; `cause` is the original error |
| `MODULE_NOT_FUNCTION` | `run` | no default export, or not a function |
| `LIBRARY_UNAVAILABLE` | `run` | no `baseUrl`, or the dir lookup failed |
| `TOOL_UNKNOWN`, `FORMAT_UNKNOWN` | backend | wire-contract faults |
| `INTERNAL` | backend | unexpected throw; message only, no stack |
