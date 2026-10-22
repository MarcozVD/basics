# Concepts

## The vault

A vault is a normal folder of Markdown files with YAML frontmatter and `[[wikilinks]]`. You can open it in Obsidian,
version it with git, or read it in any editor. Basics adds structure, not a database.

```
layers/     one note per stack layer (backend, frontend, testing, data, infra)
tech/       languages, frameworks, libraries (use_when, avoid_when, performs_best, practices, checks)
practices/  good practices (applies_to: [tech])
checks/     validations generated code must pass (kind, command, optional file templates)
profiles/   stack combinations for a project type
projects/   projects (path, status, stack, lessons, last_checks)
inbox/      proposals waiting for your approval
```

`basics.vault.json` at the root records the vault schema version. `.basics/` holds local state (embeddings, trust list,
activity log) and is added to the vault's `.gitignore` automatically.

## Note types

| Type | Folder | What it holds |
| --- | --- | --- |
| `layer` | `layers/` | A slice of the stack. Tech notes point at layers. |
| `tech` | `tech/` | When to use it and when not, best-fit cases, its practices and checks. |
| `practice` | `practices/` | A rule that applies to one or more techs. |
| `check` | `checks/` | A validation with a `kind` and an optional `command`. |
| `profile` | `profiles/` | A named stack (layer → tech ids) for a kind of project. |
| `project` | `projects/` | A real project on disk, its stack, lessons and last check results. |

Every note needs `type`; the rest of the fields depend on it. The [schema reference](../reference/schema.md) lists
every field, default and required value.

## Layers and links

Tech notes belong to one or more layers (`layer: backend` or a list). Practices and checks declare what they apply to
with `applies_to`, and a tech note lists its own with `practices` and `checks`. `[[wikilinks]]` connect anything to
anything; backlinks are computed from them, and unresolved links are reported by `basics validate`.

## The agent loop

1. **Read.** The agent calls `list_layers`, `search_vault`, `get_note` or `recommend_stack` to learn your stack before
   writing code. `get_stack_context` compiles the practices and checks of the chosen stack into one document.
2. **Propose.** With `propose_note` it sends a new note or an update, plus a `reason` and its own name. With
   `record_project_outcome` it proposes project lessons and tech-note extensions.
3. **Inbox.** The proposal lands in `inbox/` with `proposed_by`, `reason` and the proposed frontmatter and body. Nothing
   in the vault changes yet. `list_proposals` shows what is waiting.
4. **Approve.** You review the diff in the web UI or with `basics inbox show`, then approve or reject. On approval the
   note is written, `source` records who proposed it and the note gets its `updated` date.

Agents never write into the vault directly: the only MCP tools that produce changes are the two proposal tools. The
same loop applies to pack updates, which arrive as `pack:<name>@<version>` proposals.

## Provenance

`source` tells you where a note came from:

| Value | Meaning |
| --- | --- |
| `manual` | written by you, by hand or in the UI |
| `agent:<name>` | approved from an agent proposal |
| `pack:<name>@<version>` | installed or updated from a note pack |

Agent names starting with `pack:` are reserved, so an agent cannot forge pack provenance.

## Configuration

Global config lives in `~/.config/basics/config.json` (override the path with `BASICS_CONFIG`). Keys: `vault`,
`language` (`en` or `es`), `embeddings` (`true` or `false`) and `embeddingsModel`.

```bash
basics config path
basics config get
basics config set vault ~/my-vault
basics config set language en
```

Schema v2 added `version` and `packages` to tech notes, `since`/`until` to practices and checks, `last_checks` to
projects, and preserves unknown frontmatter fields when a note is read and rewritten.
