# @marcozvd/basics-core

## 0.1.0

### Minor Changes

- 48a27e2: M1 foundations:
  
  - Monorepo split into `@marcozvd/basics-core` (vault parsing, search, stack recommendation) and `@marcozvd/basics` (CLI + MCP server).
  - Schema v2: new `project` note type, `version` on tech notes, `since`/`until` on practices and checks, and unknown frontmatter fields are preserved.
  - Atomic writes plus hash-based conflict detection on note writes.
  - Global config file with default vault `~/basics-vault` and a clear error when the vault is missing.
  - Vitest, Biome, and CI across Linux, Windows and macOS on Node 20 and 22.
- Web UI (local, `basics ui`): explore with filters and search, note editor with hash-based conflict detection, inbox review with side-by-side/unified diff, and recommend playground with STACK.md export. Local REST API, live updates via SSE, MCP over HTTP at `/mcp`, and EN/ES language support.
