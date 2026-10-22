# @marcozvd/basics-core

Core library behind [Basics](https://github.com/MarcozVD/basics): a personal tech-stack knowledge vault
(Markdown + frontmatter + `[[wikilinks]]`) that your coding agents read and extend.

It provides vault parsing and validation, the v2 note schema (layer, tech, practice, check, profile, project),
full-text search, keyword and hybrid stack recommendation, markdown context rendering, atomic writes with
hash-based conflict detection, global config resolution, and the shared API types used by the CLI, HTTP API and web UI.

## Install

```bash
npm install @marcozvd/basics-core
```

Requires Node.js >= 20.11.

## Usage

```ts
import { Vault, recommend, renderContext } from "@marcozvd/basics-core";

const vault = Vault.load("./examples/vault"); // throws VaultNotFoundError if missing
const rec = recommend(vault, "REST API to serve ML models", { layers: ["backend", "data"] });

console.log(rec.layers.backend.map((c) => `${c.id} (${c.score})`)); // ranked candidates + why they matched
console.log(rec.note); // reminder: scores are a shortlist, the agent decides

// Markdown bundle ready for an agent or a project's STACK.md
const markdown = renderContext(vault, ["fastapi", "postgresql"]);
```

## API overview

- **Vault** — `Vault.load(dir)` reads every note and validates it; `vault.get(id)`, `vault.byType(type)`,
  `vault.techInLayer(layer)` and `vault.getBacklinks(id)` query it. `vault.writeNote(id, data, body, { expectedHash })`
  writes atomically and throws `ConflictError` when the file changed on disk; `deleteNote` and `reload` complete the cycle.
- **Inbox** — `vault.propose(...)`, `listProposals()`, `approve(id)`, `approveAll({ pack, version })` and `reject(id)`
  implement the agent-proposal workflow.
- **Search and navigation** — `search(vault, query)`, `listNotes(vault, { type, layer })`, `buildGraph(vault)`
  and `vaultStats(vault)`.
- **Recommendation** — `recommend(vault, description, opts)` ranks candidates per layer with a score breakdown;
  `recommendHybrid(...)` adds a local embedding score; `renderContext(vault, techIds)` and `stackContext(...)` render
  markdown for agents and project files.
- **Projects** — `detectStack(vault, dir)` reads `package.json`, `pyproject.toml` and `requirements*.txt`;
  `renderExport(...)` builds `STACK.md`, `AGENTS.md`, `CLAUDE.md` and Cursor rules; `inRange(version, since, until)`
  filters versioned practices and checks.
- **Schema and config** — `noteSchema`, `noteJsonSchemas()`, `NOTE_TYPES`, `TYPE_DIRS`, `loadConfig()`,
  `resolveVaultDir()`, plus pack helpers (`listPacks`, `installPack`, `updatePack`).

## Docs

Full documentation: [marcozvd.github.io/basics](https://marcozvd.github.io/basics/)

- [Concepts](https://marcozvd.github.io/basics/guide/concepts.html)
- [Vault schema reference](https://marcozvd.github.io/basics/reference/schema.html)
- [Stability contract](https://marcozvd.github.io/basics/guide/stability.html)

## License

MIT — see [LICENSE](https://github.com/MarcozVD/basics/blob/main/LICENSE).
