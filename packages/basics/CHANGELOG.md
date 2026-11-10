# @marcozvd/basics

## 1.8.0

### Minor Changes

- 53a5000: Basics can now guide an orchestrator, a developer and a tester differently when an agent says it has one of those roles. Each agent declares its role once through an optional `workflow` argument on `get_vault_overview` and `get_stack_context`. General agents see no change.
- 2614ed8: Connect Basics to oh-my-pi, Gemini CLI, Qwen Code, Kimi CLI, Goose, and Amp, including their Basics skills. Settings lists other agents in a collapsed group, with copyable JSON, TOML, HTTP, and command snippets for any agent. `basics connect --print` prints the same snippets.
- c63383d: The full graph is arranged in rings by note type: profiles and projects in the centre, then tech, practices, checks and layers, with faint ring guides. Switching Group by layer on and off is now fast after the first time, and each view keeps its own zoom and position. Hover highlights no longer stick after switching views.

### Patch Changes

- @marcozvd/basics-core@1.8.0

## 1.7.0

### Minor Changes

- e9ea41b: Make the review diff and Inbox easier to scan. New notes show a single unified diff, updates keep three lines of context around each change, and every proposal opens with a one-line summary. The summary names the layer note, so a Spanish vault reads the layer's own title. The Inbox can filter pending proposals by the agent that wrote them, Approve all follows the active filters and says what it will approve, and the bulk buttons stay in place when only one proposal is pending. Opening the Inbox focuses the selected row, arrows move through the list, and the command palette leads with Review next proposal when something is waiting.
- f0bbdbe: Recommend now reads as a shortlist. Each pick shows the note's title, the layer it belongs to and the reasons it matched, with the numbers kept behind a per-card Why disclosure. A tech that fits several layers appears once, under its main layer, and says where else it fits. While a new ranking runs, the previous shortlist stays visible and dimmed instead of blanking the page, and avoid-when matches are a quiet warning line instead of a red border.
- 05b8f50: Make the Inbox review loop safe. Approve, reject and Approve all wait 6 seconds before they are written: the toast names the note, shows Saving in 6 s and Undo (Z), and Z or Undo cancels the decision. Closing or reloading the tab inside that window cancels it too. Review toasts no longer cover the proposal's Reject, Edit and Approve bar. If Edit and approve fails, the editor comes back with your draft and the field errors. The proposal diff now shows the `source` line that approve writes, so the preview matches the file, and a proposer named `agent:x` no longer becomes `agent:agent:x`. Home no longer approves without a diff: its button is Review, which opens the proposal, and it shows at most three proposals with Show all in Inbox.

### Patch Changes

- 69189ff: Make every page easier to read and reach with a keyboard. A Skip to content link is the first stop on Tab, each page names itself in the browser tab and uses one main heading, and the Graph switches now show their labels. Escape clears a search before it leaves the list, the health line says "1 orphan" in words as well as colour, and an Inbox filter by agent survives Back. The editor's side sections sit under the page heading, its stack chips are no longer covered, and Save stays quiet while the note is clean.
  
  No text is smaller than 11px, Explore's headers use sentence case and the Updated column follows the same relative dates as Home, hiding when nothing has a date. Counts now use correct singular and plural forms in English and Spanish, the Projects empty state reads as one sentence, an empty search offers to create the note you typed, and agent chips use the neutral style instead of a colour that looked like a practice.
- 5b48328: Hovering a graph node feels immediate. Moving between nodes now updates only the highlight that changed, the fade no longer animates hundreds of elements, and the tooltip stays sharp and light in the Graph page (free and grouped) and in the editor's local graph.
- 05b8f50: Leaving a page no longer slows down or rewrites the next one. Leaving the graph while it is still drawing no longer freezes the next page for a moment, whether you leave with a click, the command palette, a `g` shortcut or Back. An Inbox you leave no longer adds its `?p=` selection to the next page's address. Back and Forward keep working when you click through pages quickly.
- Updated dependencies [05b8f50]
  - @marcozvd/basics-core@1.7.0

## 1.6.0

### Minor Changes

- 77761a3: Replace the floating Dock with a navigation sidebar and a single content panel. The sidebar holds the same screens, with an expanded width, an icon rail and a drawer on narrow windows, and Ctrl/Cmd+B toggles it. Settings > General > Navigation can switch to a floating bar that you drag to any edge, with arrow keys for keyboard users. The desktop app shows a thin title strip with the window controls. Language and theme move into Settings only.
- afb40ab: Add back navigation. The note and proposal views get a Back control that names the page you came from. Alt+Left, Alt+Right and the mouse side buttons move through the pages you visited, and each page returns with its scroll position and filters restored.
- b4b7f28: Simplify Home, Projects, Recommend, Inbox, Explore, Skills and Settings to one main task per screen. Home opens with one line of vault health, then waiting proposals, Continue where you left off (your recent notes and projects), three activity rows with Show all, and a single Get set up line while steps are open. Projects rows show the name, status and update time, and add a line only when checks fail or technologies are missing. Recommend puts the prompt first and folds the layer options into one line. Inbox rows show the type, title, action, author and age; the reason and the Approve, Edit and approve, and Reject actions open in the detail panel, or on the proposal page below 1280px. Explore keeps its search, type, layer, sort, view and New note in one toolbar row; its default columns are title, layers, tags and updated, the note ID appears on hover or focus, and Source appears only when the vault mixes agent, pack and hand-written notes. Skills has one filter row with an agent select, and each skill's area control sits in its Details. A page's intro sits under its title until the page has content, then moves behind a ? in the header; each intro can be dismissed. The note title wraps on narrow windows instead of being clipped.

### Patch Changes

- @marcozvd/basics-core@1.6.0

## 1.5.0

### Minor Changes

- a44defb: List the skills installed in your coding agents.
  
  - `basics skills` shows the agents and folders it found, then the skills grouped by area (Frontend, Backend, Security, Testing, DevOps, Data, AI & agents, Docs & writing, Workflow, Other). `basics skills --json` prints the same data.
  - It reads user-level skill folders for Claude Code (including skills from installed plugins), OpenCode, Codex, and the shared `~/.agents/skills`. It only reads skill files and never runs them.
  - `GET /api/skills` returns the same list. `PUT /api/skills/:key/area` and `DELETE /api/skills/:key/area` move a skill to another area, or back to the detected one.
  - Core: the config gains an optional `skills.areas` map from skill key to area id.
- 50d940f: Add `basics disconnect` to remove Basics from your coding agents.
  
  - `basics disconnect [clients...]` (also `--client <names...>`) removes only the `basics` MCP entry from each client's config and, by default, the Basics skill. Every other entry in those files stays. A config that held only the Basics entry is deleted.
  - `--no-skill` keeps the skill, `--dry-run` prints what would change and writes nothing. Claude Code is removed with the `claude` CLI when it is on PATH.
  - A config that cannot be parsed is left untouched and reported for a manual edit.
  - The local API gets `GET /api/connect/status` (which clients are detected and connected) and `POST /api/disconnect`, which requires a non-empty list of clients so no agent is unregistered by accident.
- 4181dda: Desktop app settings: Startup, close behaviour and vault folder.
  
  - Settings → Startup: start Basics when you sign in, start minimized (never, when I sign in, or always), and closing the window either keeps Basics running in the tray or quits it. The values are saved in the app's config folder.
  - The tray menu has **Settings...**, which opens the Settings page.
  - Settings → General: **Open folder** opens the vault in the file manager; **Change folder** asks for confirmation, then sets up the picked folder as a vault and restarts the server. Notes in the old folder are not moved.
  - Settings → Updates shows the installed version and links to the releases page.
- b9848f0: Add a Settings page to the web UI and the desktop app. Open it from the gear in the header or with `Ctrl`/`⌘+,`.
  
  - **General**: language, theme, and the vault path, with a copy button.
  - **Agents**: connect or disconnect each coding agent with one button, see its state, and read the file change under "Show what changes".
  - **Search**: turn semantic search on or off, with download size, progress, and index counts. Turning it off keeps the downloaded files. The new `POST /api/embeddings/disable` endpoint does this.
  - **Startup** and **Updates** are desktop-only; in a browser they explain that and link to the desktop guide.
  - **About**: version, vault path, and links to the docs, GitHub, and third-party licenses.
- fa54fb2: Add a Skills page to the web UI and the desktop app, in the Dock as **Skills** (`G` then `K`) and in the command palette.
  
  - Filter by agent (Claude Code, opencode, Codex, Shared) or by area; the area is kept in the address, so a filtered link can be shared.
  - Search skill names and descriptions, ignoring case and accents.
  - Each area shows five skills with **Show all N** to see the rest. Expand a row for its path and version.
  - Move a skill to another area from its row; **Changed by you** marks it, and reset restores the detected area.
- 239fe0b: Projects can be marked done, and two UI fixes:
  
  - Projects: a `done` status next to active, paused and archived. The status chip is a menu on each row; done projects sort last and collapse into a remembered `Done (N)` group in the All view. `get_vault_overview` and `record_project_outcome` accept done projects; archived ones are still left out of the overview.
  - Spanish: the `paused` status label is now "En pausa" (was "Pausado") everywhere it is shown.
  - Fix: Explore kept the "All" filter for a moment when opening a note from a filtered list (Checks, layers). The exiting page now keeps its own URL and filters while it fades.
  - Fix: the Recommend "Ask an agent" run survives leaving the page and a reload. The Dock shows a running dot, a toast offers to open Recommend when the run finishes elsewhere, and an interrupted run offers Retry.

### Patch Changes

- 071d277: - Desktop app: the window controls (minimize, maximize, close) and the drag area now live in the app header, and browser shortcuts and menus (reload, print, zoom, find, context menu) are turned off. Ctrl+F opens the app search.
  - Fix: after an update, the browser or the desktop app could keep showing the previous UI. `index.html` is now always revalidated, and hashed files under `/assets/` are cached for good.
- f30f814: The desktop app can update itself.
  
  - When the app starts it checks for a new version. If one is available, a card in the top-right corner shows the version, the release notes and **Update and restart**. **Later** hides it until the next start.
  - **Update and restart** downloads the update with a progress bar, closes the app, installs it and opens the new version. Your vault and config are not touched.
  - Settings → Updates shows the installed version, has **Check now**, and a switch for checking on start (on by default).
  - The first version with the updater has to be installed by hand, once, from the GitHub Releases page.
- 17898d8: Graph loads faster and stays usable on big vaults.
  
  - Large graphs (over 300 notes) settle in the background, so you can click and open notes while the layout runs. On an 860-note vault the flat graph is usable about 16 seconds sooner.
  - Zoomed out on a graph over 300 notes, labels show only the best-connected notes. Zoom in to see the rest.
  - Going back to Graph shows the picture you left, with the same positions and zoom, without laying it out again. On an 860-note vault the first frame came after about 5 to 16 seconds before, and now it is about 0.5 seconds.
  - Reloading the page keeps the node positions for the same vault and view.
  - Graph data is reused for five minutes, so opening the page again does not refetch it.
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
- 92390e1: A UX pass so a first-time user understands every page. Visual identity, routes, behaviour and keyboard shortcuts are unchanged.
  
  - The Dock is labelled and every page opens with a one-line intro; filters and controls carry a term hint explaining what they do.
  - Home shows a get-set-up checklist while the vault, an agent or a project are missing, and empty states link to the one action that fills them.
  - Recommend explains itself: **Per layer** has a tooltip, the empty state is just the day-one example chips, and **Ask an agent** says how it differs from Recommend.
  - Shortcut hints follow the platform: `⌘K` / `⌘F` / `⌘↵` on macOS, `Ctrl+K` / `Ctrl+F` / `Ctrl+Enter` elsewhere, in the Dock, Explore, Graph and Recommend.
  - Explore: the Layers column keeps each chip at its natural width and folds the rest into a `+n` (one chip + `+n` when the column is narrow), so a short layer name is never cut.
  - Graph: leaving and coming back to `/graph` keeps the canvas painting (the kept cytoscape renderer is no longer detached and destroyed).
  - Projects: missing paths are hidden in the list, empty reason and lessons say how to fill them, and the check hint says a coding agent can record the results.
  - Skills: **Details** / **Hide details** replace "more"/"less", the **Shared** filter has a hint, and the per-row area select is labelled.
- 15d9a41: The app and the MCP server answer faster on big vaults.
  
  - The UI server and the MCP server keep the parsed vault in memory and reload it only when a note file changes. Before, every request and every tool call re-read the whole vault. On an 866-note vault a warm `/api/graph` went from about 700 ms to a few milliseconds, and MCP tools from about 670 ms to about 16 ms.
  - Edits made in an editor or by `git pull` are still seen by the next request or tool call. Inbox proposals are read from disk every time.
  - Core exports `VaultCache`, `vaultSignature` and `vaultSignatureAsync` for code that holds a vault across calls.
- Updated dependencies [a44defb]
- Updated dependencies [db7a40e]
- Updated dependencies [239fe0b]
- Updated dependencies [15d9a41]
  - @marcozvd/basics-core@1.5.0

## 1.4.2

### Patch Changes

- 315c3ea: Security: notes are no longer parsed with gray-matter's JavaScript or CoffeeScript engines. A note, pack file or proposal whose frontmatter opened with `---js` (or `---javascript`, `---coffee`) was evaluated with `eval` when Basics read it, so installing a malicious community pack or opening a shared vault could run code. Such files are now reported as invalid and never executed; YAML and JSON frontmatter work as before.
- Updated dependencies [315c3ea]
  - @marcozvd/basics-core@1.4.2

## 1.4.1

### Patch Changes

- Home fits the desktop window: the inbox collapses to a one-line strip when clear, agent activity sits beside a compact vault health row and a two-column layers list, and recently edited is capped at 5. No page scroll at 1100×760 and 1280×820; three columns from 1440.
- Updated dependencies
  - @marcozvd/basics-core@1.4.1

## 1.4.0

### Minor Changes

- Ask a local coding agent for the stack, and select proposals in the Inbox.
  
  - Recommend has an **Ask an agent** action: pick Claude Code, OpenCode or Codex and one of its models, and Basics runs it headless in an empty temp directory with the `plan-stack` prompt. The answer streams in, can be cancelled, and the techs it cites can be selected for export. New `GET /api/agents`, `POST /api/agents/run` and `POST /api/agents/run/:id/cancel`.
  - Agents propose the notes a stack decision needs: the `plan-stack` prompt and the Basics skill ask for missing notes with `use_when`, `avoid_when`, links to existing notes and a specific body, listed as "Propuestas al Inbox".
  - Inbox: Reject all, and select proposals to approve or reject only those (`Vault.rejectMany`, an `ids` filter for `approveMany` and `rejectMany`, `POST /api/inbox/reject-all`).
  - Recommend hides layers with no match; turning on semantic matching retries the model download once and never saves `embeddings: true` when it fails.
  - Desktop: page gutters and Dock clearance, a capped Home activity panel, no graph edge from a note to its own layer box, and the installer bundles every runtime dependency.

### Patch Changes

- Updated dependencies
  - @marcozvd/basics-core@1.4.0

## 1.3.0

### Minor Changes

- Agents recommend the stack from the vault and every agent connects in one step.
  
  - New MCP tool `get_vault_overview` (whole catalog in one call) and MCP prompt `plan-stack`; the Basics skill now has the agent state the stack with reasons from the vault and confirm once before writing files.
  - New `basics connect`: registers the MCP server (stdio, global vault) and the skill with Claude Code, OpenCode, Codex, Cursor and Claude Desktop, backing up each config once. Also `POST /api/connect`.
  - Sharper keyword recommendations: es/en stemming, a general synonym map, IDF weighting, matches on title, tags and note text, split hyphenated tags, language boost only for techs that already match. `per_layer` is now a maximum: candidates with no match are dropped.
  - Recommend can turn on semantic matching with one click (`POST /api/embeddings/enable`).
  - Inbox: Approve all pending proposals (`Vault.approveMany`, `POST /api/inbox/approve-all` with an empty body); approving a proposal whose note changed since it was proposed now returns 409 instead of overwriting.
  - UI: graph grouped into one box per layer, layers listed in Home's vault health, agent activity scrolls on its own, Inbox cards no longer clipped, Basics logo as favicon and in the top bar, broken links can open their source or create the missing note.

### Patch Changes

- Updated dependencies
  - @marcozvd/basics-core@1.3.0

## 1.2.0

### Minor Changes

- Web UI: dropdowns no longer clip inside the editor sidebar, Add-layer pills, a New project button on Projects, a New note dialog that asks type-specific fields, Create project (or update its stack) from Recommend, and quiet hover-only scrollbars. A desktop app (Tauri) now ships separately with the same server and UI.

### Patch Changes

- Updated dependencies
  - @marcozvd/basics-core@1.2.0

## 1.1.0

### Minor Changes

- Community packs from GitHub: `basics pack add <owner>/<repo>[@ref]`, `pack update` and `pack remove`, plus "Add from GitHub" in the web UI. Pack notes always arrive as Inbox proposals; the archive reader enforces size, entry and path limits.
- Web UI: full-width layout, a Projects screen (stack, last checks, export), a dense Explore table, a two-column editor, a title-first New note dialog with inline note creation from relation fields, and Explore/Recommend state that survives navigation.

### Patch Changes

- Updated dependencies
  - @marcozvd/basics-core@1.1.0

## 1.0.0

### Major Changes

- First stable release. The note format and frontmatter, MCP tool names and inputs, CLI commands and flags, basics.json, pack format and basics.vault.json are now covered by semver (see the stability guide). Adds basics doctor, generated references, the documentation site, and the release workflow.

### Patch Changes

- Updated dependencies
  - @marcozvd/basics-core@1.0.0

## 0.4.0

### Minor Changes

- M5 hybrid recommender: keyword scoring now understands negations in Spanish and English ("sin SEO", "no UI", "without SSR") and boosts techs whose language is named in the description; the `score_breakdown` (keywords, negation, language) is printed by `basics recommend`, and `--json` keeps the JSON output. Opt-in local embeddings (`basics embeddings enable|status|reindex|disable`, model `Xenova/multilingual-e5-small`) with an incremental vector index in `<vault>/.basics/`; when enabled, the CLI, the `recommend_stack` MCP tool and the web UI use a hybrid keyword + semantic score. Adds a 30-case recommendation eval set and `npm run eval` (`--hybrid`, `--grid`).

### Patch Changes

- Updated dependencies
  - @marcozvd/basics-core@0.4.0

## 0.3.0

### Minor Changes

- Project cycle: detect the stack from a project manifests (`basics detect`, `detect_stack`), filter practices and checks by the detected version, ship check file templates (`basics export --templates`, `get_check_templates`), link a project note through `basics.json`, run the stack checks with a trust list (`basics check`) and let agents record the project outcome (`record_project_outcome`).

### Patch Changes

- Updated dependencies
  - @marcozvd/basics-core@0.3.0

## 0.2.0

### Minor Changes

- M3 content and export:
  
  - Official note packs (`packs/`) with `core-layers`, `web-typescript`, `python-api` and `profiles`, in English and Spanish, shipped with the package.
  - `basics init` creates a vault and installs the starter packs, interactively with `@clack/prompts` or with the `--lang`, `--packs` and `--yes` flags.
  - `basics pack list | install | update` manages the packs; pack updates always arrive in the inbox as proposals (`pack:<name>@<version>`) and can be approved in bulk with `basics inbox approve-all --from`.
  - Export adapters: `STACK.md`, marked `<!-- basics:start -->` blocks in `AGENTS.md` and `CLAUDE.md`, and a full Cursor `.cursor/rules/stack.mdc` with `alwaysApply`; `basics export` remembers the stack and targets in `basics.json` and `init-project` is now a deprecated alias.
  - New `export_project` MCP tool returns the files to write without touching the filesystem.
  - Web UI: starter pack onboarding on an empty vault, approve-all bar for pack proposals in the inbox, and an export modal with STACK.md / AGENTS.md / CLAUDE.md / Cursor tabs.

### Patch Changes

- Updated dependencies
  - @marcozvd/basics-core@0.2.0

## 0.1.0

### Minor Changes

- 48a27e2: M1 foundations:
  
  - Monorepo split into `@marcozvd/basics-core` (vault parsing, search, stack recommendation) and `@marcozvd/basics` (CLI + MCP server).
  - Schema v2: new `project` note type, `version` on tech notes, `since`/`until` on practices and checks, and unknown frontmatter fields are preserved.
  - Atomic writes plus hash-based conflict detection on note writes.
  - Global config file with default vault `~/basics-vault` and a clear error when the vault is missing.
  - Vitest, Biome, and CI across Linux, Windows and macOS on Node 20 and 22.
- Web UI (local, `basics ui`): explore with filters and search, note editor with hash-based conflict detection, inbox review with side-by-side/unified diff, and recommend playground with STACK.md export. Local REST API, live updates via SSE, MCP over HTTP at `/mcp`, and EN/ES language support.

### Patch Changes

- Updated dependencies [48a27e2]
- Updated dependencies
  - @marcozvd/basics-core@0.1.0
