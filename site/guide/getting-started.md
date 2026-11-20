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

## Connect an agent

Claude Code can start Basics on demand. No running server or web UI needed:

```bash
claude mcp add --scope user basics -- npx -y --package @marcozvd/basics basics-mcp /absolute/path/to/my-vault
```

Replace the path with your vault's absolute path. `--scope user` makes the server available in every project. The `basics-mcp` executable serves MCP over stdio.

Every other client (Claude Desktop, Cursor, VS Code, Codex CLI, OpenCode, Windsurf, oh-my-pi, Gemini CLI, Qwen Code, Kimi CLI, Goose, Amp) is covered in
[MCP clients](./mcp-clients.md). Any other agent gets copyable snippets from `basics connect --print`.

## Open the web UI

```bash
basics ui                    # http://127.0.0.1:4747, opens the browser
basics ui --port 5000        # another port
basics ui --no-open          # do not open the browser
```

Open the UI when you want to review proposals or edit notes. It reads and writes the same files as the CLI, so both stay in sync.
As an alternative to stdio, it also serves MCP over HTTP at `http://127.0.0.1:4747/mcp`.

For HTTP, keep the UI running and connect Claude Code:

```bash
claude mcp add --transport http basics http://127.0.0.1:4747/mcp
```

## First recommendation

```bash
basics recommend "REST API to serve ML models"
```

```
backend
  fastapi   8  kw=8 sem=— neg=0 lang=0
      use: async REST or JSON API
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
