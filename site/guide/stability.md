# Stability

Basics is pre-1.0 today. This is the contract we intend to keep from 1.0: what a minor release can change and what it
cannot.

## Covered by semver

A breaking change to any of these ships in a major release:

- **Note format and frontmatter** — the types, fields, required values and defaults in the
  [schema reference](../reference/schema.md). Unknown frontmatter fields stay preserved on read and write.
- **MCP tool names and inputs** — the tools listed in the [MCP tools reference](../reference/mcp-tools.md) keep their
  names and accepted arguments. Outputs may gain fields; nothing you send will change meaning in a minor.
- **CLI commands and flags** — commands, subcommands, flag names and their meaning. New commands and optional flags are
  minor releases. Removing or renaming one is a major release; before that it is deprecated and still works.
- **`basics.json`** — the project file read by `basics check`, with `stack`, `targets`, `project` and `versions`.
- **Pack format** — `pack.json` fields and the `notes/<lang>/<type>/` layout, so published packs keep installing.
- **`basics.vault.json`** — the vault schema marker. A vault written by a newer `schemaVersion` needs a newer Basics;
  older vaults keep working.

## Not covered

- **UI layout and routes** — screens, components, shortcuts, colors and copy can change in any release.
- **Exact scores and ordering** — score values and therefore the order of recommendations can change when the scoring
  improves. Treat `recommend` as a shortlist, not a fixed ranking.
- **Internal APIs of `@marcozvd/basics-core`** — only what is documented here is public. Undocumented exports and file
  formats can change without notice.
- **Generated reference formatting** — the content of `site/reference/*.md` is generated from the code; its Markdown
  layout is not part of the contract.

## Deprecations

A command, flag or field that is going away is marked deprecated and keeps working for at least one minor release.
`init-project` is the current example: a hidden, deprecated alias for `basics export --targets agents`.

## Before 1.0

The 0.x releases may still change any of the above, with a note in the changelog and a changeset. Pin the version if you
script around the CLI, and run `basics validate` after upgrading a vault.
