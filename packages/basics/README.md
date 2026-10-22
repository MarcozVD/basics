# @marcozvd/basics

[![CI](https://github.com/MarcozVD/basics/actions/workflows/ci.yml/badge.svg)](https://github.com/MarcozVD/basics/actions/workflows/ci.yml)

CLI, local web UI and MCP server for [Basics](https://github.com/MarcozVD/basics): a personal tech-stack vault in
Markdown that your coding agents read and extend. Agents never write behind your back — every change lands in an
inbox for you to approve.

## Install

Requires Node.js >= 20.11.

```bash
npm install -g @marcozvd/basics   # or: pnpm add -g @marcozvd/basics
basics --help
```

## Quick start

```bash
basics init ~/basics-vault --yes   # create the vault with the official packs
basics --vault ~/basics-vault ui   # web UI + HTTP API on http://127.0.0.1:4747
basics doctor                      # check Node, config, vault, packs and embeddings
```

With the UI running, connect Claude Code:

```bash
claude mcp add --transport http basics http://127.0.0.1:4747/mcp
```

Without the UI, the package also ships a stdio MCP server:

```bash
claude mcp add basics --scope user -- basics-mcp /absolute/path/to/my-vault
```

Main commands: `basics init`, `list`, `validate`, `new`, `recommend`, `inbox`, `pack`, `export`, `detect`, `check`,
`embeddings`, `doctor` and `ui`. Run `basics <command> --help` for flags.

## Docs

Full documentation: [marcozvd.github.io/basics](https://marcozvd.github.io/basics/)

- [Getting started](https://marcozvd.github.io/basics/guide/getting-started.html)
- [CLI reference](https://marcozvd.github.io/basics/reference/cli.html)
- [MCP tools reference](https://marcozvd.github.io/basics/reference/mcp-tools.html)
- [Stability contract](https://marcozvd.github.io/basics/guide/stability.html)

## License

MIT — see [LICENSE](https://github.com/MarcozVD/basics/blob/main/LICENSE).
