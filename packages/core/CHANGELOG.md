# @marcozvd/basics-core

## 1.7.0

### Minor Changes

- 05b8f50: Make the Inbox review loop safe. Approve, reject and Approve all wait 6 seconds before they are written: the toast names the note, shows Saving in 6 s and Undo (Z), and Z or Undo cancels the decision. Closing or reloading the tab inside that window cancels it too. Review toasts no longer cover the proposal's Reject, Edit and Approve bar. If Edit and approve fails, the editor comes back with your draft and the field errors. The proposal diff now shows the `source` line that approve writes, so the preview matches the file, and a proposer named `agent:x` no longer becomes `agent:agent:x`. Home no longer approves without a diff: its button is Review, which opens the proposal, and it shows at most three proposals with Show all in Inbox.

## 1.6.0

No changes in this release.

## 1.5.0

### Minor Changes

- a44defb: List the skills installed in your coding agents.
  
  - `basics skills` shows the agents and folders it found, then the skills grouped by area (Frontend, Backend, Security, Testing, DevOps, Data, AI & agents, Docs & writing, Workflow, Other). `basics skills --json` prints the same data.
  - It reads user-level skill folders for Claude Code (including skills from installed plugins), OpenCode, Codex, and the shared `~/.agents/skills`. It only reads skill files and never runs them.
  - `GET /api/skills` returns the same list. `PUT /api/skills/:key/area` and `DELETE /api/skills/:key/area` move a skill to another area, or back to the detected one.
  - Core: the config gains an optional `skills.areas` map from skill key to area id.
- 239fe0b: Projects can be marked done, and two UI fixes:
  
  - Projects: a `done` status next to active, paused and archived. The status chip is a menu on each row; done projects sort last and collapse into a remembered `Done (N)` group in the All view. `get_vault_overview` and `record_project_outcome` accept done projects; archived ones are still left out of the overview.
  - Spanish: the `paused` status label is now "En pausa" (was "Pausado") everywhere it is shown.
  - Fix: Explore kept the "All" filter for a moment when opening a note from a filtered list (Checks, layers). The exiting page now keeps its own URL and filters while it fades.
  - Fix: the Recommend "Ask an agent" run survives leaving the page and a reload. The Dock shows a running dot, a toast offers to open Recommend when the run finishes elsewhere, and an interrupted run offers Retry.

### Patch Changes

- db7a40e: Smaller MCP responses for agents, a slimmer `plan-stack` prompt, and faster search.
  
  MCP contract changes:
  
  - `search_vault` returns `{ "hits": [...], "total": n, "hint"?: "..." }` instead of a bare array. `total` counts the notes that matched before `limit`; `hint` appears only when the list is capped.
  - `get_note` no longer returns `hash`, the concurrency token the app editor uses. Agents never needed it.
  - `recommend_stack` omits empty `matched_*` and `negated_*` lists, zero parts of `score_breakdown` and a zero `language_boost`. Its `note` is one line; the scoring details moved to the tool description.
  - Every MCP JSON response is compact (no indentation).
  
  Other changes:
  
  - The `plan-stack` prompt is about 17% shorter, with the same steps and rules.
  - The UI server and the MCP server build the search index once per vault change instead of on every query. On the 860-note test vault a search for a new query went from about 9 ms to 2.5 ms over HTTP; the result ranking is unchanged.
  - Core exports `buildSearchIndex` and `searchAll`. `search` keeps its array result.
- 15d9a41: The app and the MCP server answer faster on big vaults.
  
  - The UI server and the MCP server keep the parsed vault in memory and reload it only when a note file changes. Before, every request and every tool call re-read the whole vault. On an 866-note vault a warm `/api/graph` went from about 700 ms to a few milliseconds, and MCP tools from about 670 ms to about 16 ms.
  - Edits made in an editor or by `git pull` are still seen by the next request or tool call. Inbox proposals are read from disk every time.
  - Core exports `VaultCache`, `vaultSignature` and `vaultSignatureAsync` for code that holds a vault across calls.

## 1.4.2

### Patch Changes

- 315c3ea: Security: notes are no longer parsed with gray-matter's JavaScript or CoffeeScript engines. A note, pack file or proposal whose frontmatter opened with `---js` (or `---javascript`, `---coffee`) was evaluated with `eval` when Basics read it, so installing a malicious community pack or opening a shared vault could run code. Such files are now reported as invalid and never executed; YAML and JSON frontmatter work as before.

## 1.4.1

### Patch Changes

- Home fits the desktop window: the inbox collapses to a one-line strip when clear, agent activity sits beside a compact vault health row and a two-column layers list, and recently edited is capped at 5. No page scroll at 1100×760 and 1280×820; three columns from 1440.

## 1.4.0

### Minor Changes

- Ask a local coding agent for the stack, and select proposals in the Inbox.
  
  - Recommend has an **Ask an agent** action: pick Claude Code, OpenCode or Codex and one of its models, and Basics runs it headless in an empty temp directory with the `plan-stack` prompt. The answer streams in, can be cancelled, and the techs it cites can be selected for export. New `GET /api/agents`, `POST /api/agents/run` and `POST /api/agents/run/:id/cancel`.
  - Agents propose the notes a stack decision needs: the `plan-stack` prompt and the Basics skill ask for missing notes with `use_when`, `avoid_when`, links to existing notes and a specific body, listed as "Propuestas al Inbox".
  - Inbox: Reject all, and select proposals to approve or reject only those (`Vault.rejectMany`, an `ids` filter for `approveMany` and `rejectMany`, `POST /api/inbox/reject-all`).
  - Recommend hides layers with no match; turning on semantic matching retries the model download once and never saves `embeddings: true` when it fails.
  - Desktop: page gutters and Dock clearance, a capped Home activity panel, no graph edge from a note to its own layer box, and the installer bundles every runtime dependency.

## 1.3.0

### Minor Changes

- Agents recommend the stack from the vault and every agent connects in one step.
  
  - New MCP tool `get_vault_overview` (whole catalog in one call) and MCP prompt `plan-stack`; the Basics skill now has the agent state the stack with reasons from the vault and confirm once before writing files.
  - New `basics connect`: registers the MCP server (stdio, global vault) and the skill with Claude Code, OpenCode, Codex, Cursor and Claude Desktop, backing up each config once. Also `POST /api/connect`.
  - Sharper keyword recommendations: es/en stemming, a general synonym map, IDF weighting, matches on title, tags and note text, split hyphenated tags, language boost only for techs that already match. `per_layer` is now a maximum: candidates with no match are dropped.
  - Recommend can turn on semantic matching with one click (`POST /api/embeddings/enable`).
  - Inbox: Approve all pending proposals (`Vault.approveMany`, `POST /api/inbox/approve-all` with an empty body); approving a proposal whose note changed since it was proposed now returns 409 instead of overwriting.
  - UI: graph grouped into one box per layer, layers listed in Home's vault health, agent activity scrolls on its own, Inbox cards no longer clipped, Basics logo as favicon and in the top bar, broken links can open their source or create the missing note.

## 1.2.0

### Minor Changes

- Web UI: dropdowns no longer clip inside the editor sidebar, Add-layer pills, a New project button on Projects, a New note dialog that asks type-specific fields, Create project (or update its stack) from Recommend, and quiet hover-only scrollbars. A desktop app (Tauri) now ships separately with the same server and UI.

## 1.1.0

### Minor Changes

- Community packs from GitHub: `basics pack add <owner>/<repo>[@ref]`, `pack update` and `pack remove`, plus "Add from GitHub" in the web UI. Pack notes always arrive as Inbox proposals; the archive reader enforces size, entry and path limits.

## 1.0.0

### Major Changes

- First stable release. The note format and frontmatter, MCP tool names and inputs, CLI commands and flags, basics.json, pack format and basics.vault.json are now covered by semver (see the stability guide). Adds basics doctor, generated references, the documentation site, and the release workflow.

## 0.4.0

### Minor Changes

- M5 hybrid recommender: keyword scoring now understands negations in Spanish and English ("sin SEO", "no UI", "without SSR") and boosts techs whose language is named in the description; the `score_breakdown` (keywords, negation, language) is printed by `basics recommend`, and `--json` keeps the JSON output. Opt-in local embeddings (`basics embeddings enable|status|reindex|disable`, model `Xenova/multilingual-e5-small`) with an incremental vector index in `<vault>/.basics/`; when enabled, the CLI, the `recommend_stack` MCP tool and the web UI use a hybrid keyword + semantic score. Adds a 30-case recommendation eval set and `npm run eval` (`--hybrid`, `--grid`).

## 0.3.0

### Minor Changes

- Project cycle: detect the stack from a project manifests (`basics detect`, `detect_stack`), filter practices and checks by the detected version, ship check file templates (`basics export --templates`, `get_check_templates`), link a project note through `basics.json`, run the stack checks with a trust list (`basics check`) and let agents record the project outcome (`record_project_outcome`).

## 0.2.0

### Minor Changes

- M3 content and export:
  
  - Official note packs (`packs/`) with `core-layers`, `web-typescript`, `python-api` and `profiles`, in English and Spanish, shipped with the package.
  - `basics init` creates a vault and installs the starter packs, interactively with `@clack/prompts` or with the `--lang`, `--packs` and `--yes` flags.
  - `basics pack list | install | update` manages the packs; pack updates always arrive in the inbox as proposals (`pack:<name>@<version>`) and can be approved in bulk with `basics inbox approve-all --from`.
  - Export adapters: `STACK.md`, marked `<!-- basics:start -->` blocks in `AGENTS.md` and `CLAUDE.md`, and a full Cursor `.cursor/rules/stack.mdc` with `alwaysApply`; `basics export` remembers the stack and targets in `basics.json` and `init-project` is now a deprecated alias.
  - New `export_project` MCP tool returns the files to write without touching the filesystem.
  - Web UI: starter pack onboarding on an empty vault, approve-all bar for pack proposals in the inbox, and an export modal with STACK.md / AGENTS.md / CLAUDE.md / Cursor tabs.

## 0.1.0

### Minor Changes

- 48a27e2: M1 foundations:
  
  - Monorepo split into `@marcozvd/basics-core` (vault parsing, search, stack recommendation) and `@marcozvd/basics` (CLI + MCP server).
  - Schema v2: new `project` note type, `version` on tech notes, `since`/`until` on practices and checks, and unknown frontmatter fields are preserved.
  - Atomic writes plus hash-based conflict detection on note writes.
  - Global config file with default vault `~/basics-vault` and a clear error when the vault is missing.
  - Vitest, Biome, and CI across Linux, Windows and macOS on Node 20 and 22.
- Web UI (local, `basics ui`): explore with filters and search, note editor with hash-based conflict detection, inbox review with side-by-side/unified diff, and recommend playground with STACK.md export. Local REST API, live updates via SSE, MCP over HTTP at `/mcp`, and EN/ES language support.
