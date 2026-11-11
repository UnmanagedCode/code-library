# Code Library

A cc plugin that lets a worker save a reusable JavaScript module once and run it from any later `run_code` program, instead of rewriting the same digests and actions every session.

## Quick start

- Enable the plugin in cc (Settings → Plugins → Rescan, then enable). It has no dependencies, so nothing is installed.
- In a `run_code` program: `await cc.code_library.save({name, description, source})`, then `await cc.code_library.run({name, args})`.
- Tests: `npm test`.

## Layout

```
conductor.plugin.json   manifest: tools save/list/describe, runCode member run
server.js               backend entry
src/                    config, moduleRules, library (the store), mcp + views, http, app, runCode/index.js
claude/                 Claude plugin with the library-modules skill
tests/                  node:test suites
docs/                   features, protocol, architecture
```

## Key defaults

- Module names: the rule in `src/moduleRules.js` (also the manifest patterns).
- Store: `$CONDUCTOR_PLUGIN_DATA_DIR`, one `<name>.mjs` plus `<name>.json` per module.
- Backend listens on `127.0.0.1` only.

## Known limitations

- No delete, versioning, authorship or approval.
- No npm dependencies in modules; a bare specifier fails as `MODULE_LOAD_FAILED`.
- Source is not syntax-checked at save; errors surface at `run`.
- A module is imported once per program (ESM cache); a re-save applies from the next program.
- Local-only (cc's `RUN_CODE_LOCAL_ONLY`).

## Docs

- [docs/features.md](docs/features.md) — user-facing surface and examples
- [docs/protocol.md](docs/protocol.md) — tools, member, routes, refusal codes
- [docs/architecture.md](docs/architecture.md) — components, on-disk state, tests
