# MCP clients

Basics exposes the same twelve tools over two transports:

- **stdio** — the `basics-mcp` binary, available after installing `@marcozvd/basics`. No server to start.
- **HTTP** — `http://127.0.0.1:4747/mcp` while `basics ui` is running. Streamable HTTP with `mcp-session-id`
  sessions; the server drops inactive ones.

The server keeps the parsed vault in memory and reloads it only when a note file changes. Before each tool call it checks
the vault for changes, so an edit made in an editor or by `git pull` is seen by the very next call. Inbox proposals are
read from disk on every call.

Pass the vault as an absolute path for stdio. If you omit it, `basics-mcp` resolves it like the CLI: `BASICS_DIR`,
then the global config, then `~/basics-vault`.

## One step: `basics connect`

`basics connect` registers the server for every coding agent it finds, always at user scope and always pointing at the
same global vault (`basics config get` shows which):

```bash
basics connect                    # every detected client, stdio
basics connect --client cursor    # only the clients you name
basics connect --transport http   # http://127.0.0.1:4747/mcp, while `basics ui` or the desktop app runs
basics connect --port 5000        # another port for the http transport
basics connect --dry-run          # print the diff of every file and write nothing
basics connect --no-skill         # register the server, skip the skill
basics connect --print            # copyable JSON, TOML, HTTP and command snippets; writes nothing
```

It knows `claude-code`, `opencode`, `codex`, `cursor`, `claude-desktop`, `oh-my-pi`, `gemini-cli`, `qwen-code`, `kimi-cli`, `goose` and `amp`, prints a table (client, detected, what
changes, result), backs each edited file up as `<file>.basics-backup` once, and installs the Basics skill for Claude
Code, OpenCode, Codex and the six agents in the next section. Cursor and Claude Desktop get the server only. The desktop app calls the same code through
`POST /api/connect`.

The web UI's **Settings → Agents** page does the same from the browser. Detected and connected clients are listed together, the rest sit under **Other agents**, and each change is shown under **Show what changed**.

To take Basics back out, `basics disconnect` removes the `basics` entry from each client's config and the Basics skill,
and leaves every other entry in those files alone:

```bash
basics disconnect                  # every client
basics disconnect --client cursor  # only the clients you name
basics disconnect --no-skill       # remove the server, keep the skill
basics disconnect --dry-run        # print what would change and write nothing
```

A config file that held nothing but the Basics entry, such as one `basics connect` created, is deleted. Claude Code is
removed with the `claude` CLI when it is on your PATH. A config that cannot be parsed is left untouched and reported,
so you can edit it by hand. The local API has `GET /api/connect/status`, which reports for each client whether it is
detected and connected, along with the snippets for other agents, and `POST /api/disconnect`, which needs a non-empty list of clients.

## Claude Code

```bash
# HTTP, while `basics ui` is running
claude mcp add --transport http basics http://127.0.0.1:4747/mcp

# stdio, no UI needed
claude mcp add basics --scope user -- basics-mcp /absolute/path/to/my-vault
```

## Claude Desktop

Edit `claude_desktop_config.json` and restart the app.

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "basics": {
      "command": "basics-mcp",
      "args": ["/absolute/path/to/my-vault"]
    }
  }
}
```

## Cursor

Global `~/.cursor/mcp.json` or project `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "basics": {
      "command": "basics-mcp",
      "args": ["/absolute/path/to/my-vault"]
    }
  }
}
```

With the UI running, Cursor can use the HTTP endpoint instead:

```json
{
  "mcpServers": {
    "basics": {
      "url": "http://127.0.0.1:4747/mcp"
    }
  }
}
```

## VS Code (Copilot)

Project `.vscode/mcp.json` (or **MCP: Add Server** from the Command Palette). VS Code uses `servers`, not
`mcpServers`:

```json
{
  "servers": {
    "basics": {
      "type": "stdio",
      "command": "basics-mcp",
      "args": ["/absolute/path/to/my-vault"]
    }
  }
}
```

```json
{
  "servers": {
    "basics": {
      "type": "http",
      "url": "http://127.0.0.1:4747/mcp"
    }
  }
}
```

## Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.basics]
command = "basics-mcp"
args = ["/absolute/path/to/my-vault"]
```

## OpenCode

Global `~/.config/opencode/opencode.json` or project `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "basics": {
      "type": "local",
      "command": ["basics-mcp", "/absolute/path/to/my-vault"],
      "enabled": true
    }
  }
}
```

With the UI or the desktop app running, use the HTTP endpoint instead:

```json
{
  "mcp": {
    "basics": { "type": "remote", "url": "http://127.0.0.1:4747/mcp", "enabled": true }
  }
}
```

Restart OpenCode afterwards; `opencode mcp list` shows the server once it is loaded.

## Windsurf

`~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "basics": {
      "command": "basics-mcp",
      "args": ["/absolute/path/to/my-vault"]
    }
  }
}
```

## Six more agents

`basics connect` sets up these six agents the same way as the clients above: it edits only the `basics` entry, backs the file up once and installs the Basics skill. It finds each one by its config folder or its command on your `PATH`, and `--client` takes the name in the first column.

| Agent (`--client`) | Config file on macOS and Linux | Transports | Skill directory |
| --- | --- | --- | --- |
| oh-my-pi (`oh-my-pi`) | `~/.omp/agent/mcp.json` | JSON `mcpServers.basics`; stdio `command` and `args`; HTTP `type: "http"` and `url` | `~/.omp/agent/skills/basics/` |
| Gemini CLI (`gemini-cli`) | `~/.gemini/settings.json` | JSON `mcpServers.basics`; stdio `command` and `args`; HTTP `httpUrl` | `~/.gemini/skills/basics/` |
| Qwen Code (`qwen-code`) | `~/.qwen/settings.json` | JSON `mcpServers.basics`; stdio `command` and `args`; HTTP `httpUrl` | `~/.qwen/skills/basics/` |
| Kimi CLI (`kimi-cli`) | `~/.kimi/mcp.json` | JSON `mcpServers.basics`; stdio `command` and `args`; HTTP `url` | `~/.kimi/skills/basics/` |
| Goose (`goose`) | `~/.config/goose/config.yaml` | YAML `extensions.basics`; stdio `type: stdio` with `cmd` and `args`; HTTP `type: streamable_http` with `uri` | `~/.agents/skills/basics/` |
| Amp (`amp`) | `~/.config/amp/settings.json`, or `settings.jsonc` when only that file has content | JSON or JSONC under the literal key `amp.mcpServers`; stdio `command` and `args`; HTTP `url` | `~/.config/amp/skills/basics/` |

On Windows the same paths sit under `%USERPROFILE%`, except Goose, which uses `%APPDATA%\Block\goose\config\config.yaml`. These are the default locations. A custom config root, a named profile or a settings-file flag needs the manual snippet in the Any other agent section below, adapted to that location.

- **oh-my-pi** also keeps a `disabledServers` list. Connect removes `basics` from it, so the server runs.
- **Goose** is edited only where `extensions` is a block mapping. A flow or quoted extension map, an unusual indent or a malformed file is left alone, and connect prints the entry to merge by hand.
- **JSON configs** that do not parse, or repeat a key, are never overwritten. The result names the file and gives the entry to paste.

## Any other agent

Any agent that reads an MCP config can use Basics. Settings → Agents shows four forms under **Other agent: manual setup**, each with a Copy button. In a terminal, `basics connect --print` prints the same snippets without looking for agents and without writing anything:

```bash
basics connect --print                 # the snippets for port 4747
basics connect --print --port 5000     # the http snippet uses another port
```

- `json`: `mcpServers.basics` with `command` and `args`, for JSON configs.
- `toml`: `[mcp_servers.basics]` with `command` and `args`, for TOML configs.
- `http`: `http://127.0.0.1:4747/mcp`, for agents that connect over HTTP while `basics ui` or the desktop app runs.
- `command`: one command line that starts the server on your vault, for agents that take a command.

The snippets name this install's Node runtime and MCP server file, plus the vault you pass, so they start the same server that `basics connect` registers. Put them in the agent's own MCP settings and check the root key in its docs, since some agents name it differently.

### Windows and PowerShell quoting

On Windows the `command` snippet starts with `& ` and wraps each part in single quotes, so a path with spaces stays one argument. Its shape is:

```powershell
& 'C:\path\to\node.exe' 'C:\path\to\dist\mcp\server.js' 'C:\Users\you\my vault'
```

A single quote inside a part is doubled (`''`). In `cmd.exe` these quotes and the leading `&` do not work, so use the `json` or `toml` snippet there.

## Installed from source

If you run the repo instead of the npm package, point stdio at the built server:

```json
{
  "command": "node",
  "args": ["/path/to/basics/packages/basics/dist/mcp/server.js", "/absolute/path/to/my-vault"]
}
```

On Windows, if a client reports that the command is not found, use `basics-mcp.cmd` or `command: "node"` with the full
path to `dist/mcp/server.js`.

## What the agent can do

| Tools | Effect |
| --- | --- |
| `list_layers`, `search_vault`, `get_note`, `get_vault_overview`, `recommend_stack`, `get_stack_context`, `detect_stack`, `get_check_templates`, `export_project` | read-only; `export_project` returns file contents and writes nothing |
| `propose_note`, `record_project_outcome` | create inbox proposals, never direct writes |
| `list_proposals` | read the pending inbox |

`get_vault_overview` and `get_stack_context` also take an optional `workflow` argument, for agents that have an
orchestrated-team role. Without it, or with `general`, both return exactly what they returned before. See
[Agent skill](./agent-skill.md#roles-in-an-orchestrated-team).

Prompts are MCP prompts the client can insert into the conversation:

| Prompt | Effect |
| --- | --- |
| `plan-stack` | takes the project description, reads `get_vault_overview` and `recommend_stack`, reads the deciding notes, proposes one tech per layer with reasons from the vault, proposes any note the decision needs that the vault is missing, and asks for confirmation before writing files |

Inputs, defaults and minimal calls for each tool are in the [MCP tools reference](../reference/mcp-tools.md). After
changing a client config, restart the client; tools appear only when the connection succeeds.
