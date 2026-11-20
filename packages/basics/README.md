# @marcozvd/basics

[![CI](https://github.com/MarcozVD/basics/actions/workflows/ci.yml/badge.svg)](https://github.com/MarcozVD/basics/actions/workflows/ci.yml)

CLI, local web UI and MCP server for [Basics](https://github.com/MarcozVD/basics): a personal tech-stack vault in
Markdown that your coding agents read and extend. Agents never write behind your back: every change lands in an
inbox for you to approve.

## Install

Requires Node.js >= 20.11.

```bash
npm install -g @marcozvd/basics   # or: pnpm add -g @marcozvd/basics
basics --help
```

## Quick start

Requires Node.js 20.11 or newer. Connect Claude Code over stdio; no running server or web UI needed:

```bash
# create a vault with the official packs
npx @marcozvd/basics init ~/basics-vault --yes

# connect Claude Code (use your vault's absolute path)
claude mcp add --scope user basics -- npx -y --package @marcozvd/basics basics-mcp /absolute/path/to/basics-vault
```

Ask your agent to recommend a stack. To review and approve proposals in the Inbox, open the web UI when needed:

```bash
npx @marcozvd/basics --vault ~/basics-vault ui
```

Alternatively, connect over HTTP while the UI is running:

```bash
claude mcp add --transport http basics http://127.0.0.1:4747/mcp
```

Main commands: `basics init`, `list`, `validate`, `new`, `recommend`, `inbox`, `pack`, `export`, `detect`, `check`,
`compare`, `embeddings`, `doctor` and `ui`. Run `basics <command> --help` for flags.

## Docs

Full documentation: [marcozvd.github.io/basics](https://marcozvd.github.io/basics/)

- [Getting started](https://marcozvd.github.io/basics/guide/getting-started.html)
- [CLI reference](https://marcozvd.github.io/basics/reference/cli.html)
- [MCP tools reference](https://marcozvd.github.io/basics/reference/mcp-tools.html)
- [Stability contract](https://marcozvd.github.io/basics/guide/stability.html)

## License

MIT. See [LICENSE](https://github.com/MarcozVD/basics/blob/main/LICENSE).
