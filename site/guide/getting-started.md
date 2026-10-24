# Getting started

Basics is a CLI, a local web UI and an MCP server over the same vault: a folder of Markdown notes about your stack.
Requires Node.js >= 20.11.

## Install

```bash
# run once without installing
npx @marcozvd/basics --help

# or install globally
npm install -g @marcozvd/basics

# or with pnpm
pnpm add -g @marcozvd/basics
```

## Create a vault

```bash
basics init                  # asks for folder, language and packs
basics init ~/my-vault --yes # all official packs, no questions
```

`basics init` creates one folder per note type plus `inbox/`, installs the packs you pick and saves `vault` and
`language` in the global config. Flags:

| Flag | Use |
| --- | --- |
| `--lang en\|es` | language of the pack notes |
| `--packs a,b` | install only these packs (or `--packs none`) |
| `--yes` | accept defaults and install every pack |

Without a terminal it behaves like `--yes`.

The vault path is resolved as: `--vault <dir>` > `BASICS_DIR` > `vault` in the config > `~/basics-vault`.

## Open the web UI

```bash
basics ui                    # http://127.0.0.1:4747, opens the browser
basics ui --port 5000        # another port
basics ui --no-open          # do not open the browser
```

The UI reads and writes the same files as the CLI, so both stay in sync. Leave it running while you work: it also
serves MCP over HTTP at `http://127.0.0.1:4747/mcp`.

## Connect an agent

Claude Code, with the UI running:

```bash
claude mcp add --transport http basics http://127.0.0.1:4747/mcp
```

Or connect over stdio without the UI:

```bash
claude mcp add basics --scope user -- basics-mcp /absolute/path/to/my-vault
```

Every other client (Claude Desktop, Cursor, VS Code, Codex CLI, OpenCode, Windsurf) is covered in
[MCP clients](./mcp-clients.md).

## First recommendation

```bash
basics recommend "REST API to serve ML models"
```

```
backend
  fastapi   8  kw=8 sem=— neg=0 lang=0
      use: API REST o JSON async
  python    2  kw=2 sem=— neg=0 lang=0
      best: data and ML ecosystem
```

The score breakdown is `kw` (keywords), `sem` (semantic similarity, `—` when embeddings are off), `neg` (negations)
and `lang` (language boost). Scores depend on your notes; the ids and reasons are what matter.

Ask your agent to call `recommend_stack` with the project description and it gets the same shortlist, then chooses and
explains. Anything it wants to add to the vault goes to the Inbox for approval.

## Check the install

```bash
basics doctor
```

It checks Node, the config file, the vault, packs and embeddings. `basics doctor --fix` repairs what it knows how to
repair. See [Troubleshooting](./troubleshooting.md) if a check fails.
