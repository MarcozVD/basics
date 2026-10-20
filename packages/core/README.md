# @marcozvd/basics-core

Core library behind [Basics](https://github.com/MarcozVD/basics): a personal tech-stack knowledge vault
(Markdown + frontmatter + `[[wikilinks]]`) that your coding agents read and extend.

It provides vault parsing and validation, the v2 note schema (layer, tech, practice, check, profile, project),
full-text search, keyword-based stack recommendation, markdown context rendering, atomic writes with
hash-based conflict detection, global config resolution, and the shared API types used by the CLI, HTTP API and web UI.

> **Status: experimental (0.x).** API may change without notice.

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
console.log(rec.note); // reminder: scores are keyword overlap only, the agent decides

// Markdown bundle ready for an agent or a project's STACK.md
const markdown = renderContext(vault, ["fastapi", "postgresql"]);
```

Notes are read with `vault.get(id)` / `vault.byType("tech")`, written with `vault.writeNote(id, data, body, { expectedHash })`
(throws `ConflictError` when the file changed on disk), and looked up with `vault.getBacklinks(id)`, `search(vault, q)`
and `listNotes(vault, { type, layer })`.

## License

MIT — see [LICENSE](./LICENSE) and the [repository](https://github.com/MarcozVD/basics).
