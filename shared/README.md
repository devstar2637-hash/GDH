# shared/ — contract between lanes (FROZEN at 12:15 KST, see AGENTS.md)

- `types.ts`     Store, Shock, RunResult and the status-bar payload. Owner: Taehyeon (approval required to change).
- `forbidden-paths.json`  JSON-patch paths that the Argon roles may never touch (checks, expected values, result numbers).
- Engine, loop and web import from here and never write here.
