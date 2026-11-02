---
"@marcozvd/basics": minor
"@marcozvd/basics-core": minor
---

List the skills installed in your coding agents.

- `basics skills` shows the agents and folders it found, then the skills grouped by area (Frontend, Backend, Security, Testing, DevOps, Data, AI & agents, Docs & writing, Workflow, Other). `basics skills --json` prints the same data.
- It reads user-level skill folders for Claude Code (including skills from installed plugins), OpenCode, Codex, and the shared `~/.agents/skills`. It only reads skill files and never runs them.
- `GET /api/skills` returns the same list. `PUT /api/skills/:key/area` and `DELETE /api/skills/:key/area` move a skill to another area, or back to the detected one.
- Core: the config gains an optional `skills.areas` map from skill key to area id.
