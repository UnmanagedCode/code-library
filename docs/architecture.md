# Architecture

## Components

| File | One responsibility |
|---|---|
| `server.js` | build state, listen on `127.0.0.1`, shut down on SIGTERM/SIGINT |
| `src/config.js` | `loadConfig`: port and data dir from env |
| `src/moduleRules.js` | name and size rules, file path helpers |
| `src/library.js` | the store; the only code touching the data dir |
| `src/mcp.js`, `src/views.js` | cc's typed-tool wire; text rendering |
| `src/http.js`, `src/app.js` | HTTP helpers; routes and the Origin guard |
| `src/runCode/index.js` | the `run` member |

## On-disk state (`$CONDUCTOR_PLUGIN_DATA_DIR`)

- `<name>.mjs` — the module; `<name>.json` — `{description}`; transient `.<name>.<random>.tmp`.
- Files are mode `0600`, the dir `0700`.

## Save

- Per-name serialization in-process (the backend is the only writer).
- Sidecar written before the module, each via temp file + rename, so `list` never sees a module without its description.
- A missing or invalid sidecar lists as `""` with one `log.warn`.

## Run

- cc calls the factory with `{pluginId, baseUrl, caller, cc}`; it does no I/O.
- `run` asks the backend (`GET <baseUrl>/api/library-dir`) once per factory, because only the backend gets the data dir; failures are retried by the next `run`.
- Each `run` is a separate `import()`: a broken module fails only modules that import it.
- ESM caches modules per process, so a re-save applies from the next program.

## Tests

`node --test`, no dependencies. Each test uses a fresh `tmpDir()`. `scrubbedEnv` strips `PROJECTS_ROOT`, `PORT` and `CONDUCTOR_*`; `startServer` refuses a `PROJECTS_ROOT`. The run module is tested against a real in-process `createApp`. `tests/_jsonSchemaSubset.mjs` is a test-only port of cc's schema validator.
