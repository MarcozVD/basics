---
"@marcozvd/basics": minor
---

Add `basics disconnect` to remove Basics from your coding agents.

- `basics disconnect [clients...]` (also `--client <names...>`) removes only the `basics` MCP entry from each client's config and, by default, the Basics skill. Every other entry in those files stays. A config that held only the Basics entry is deleted.
- `--no-skill` keeps the skill, `--dry-run` prints what would change and writes nothing. Claude Code is removed with the `claude` CLI when it is on PATH.
- A config that cannot be parsed is left untouched and reported for a manual edit.
- The local API gets `GET /api/connect/status` (which clients are detected and connected) and `POST /api/disconnect`, which requires a non-empty list of clients so no agent is unregistered by accident.
