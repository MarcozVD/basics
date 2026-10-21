# @marcozvd/basics-core

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
