# MCP clients

Basics exposes the same twelve tools over two transports:

- **stdio** — the `basics-mcp` binary, available after installing `@marcozvd/basics`. No server to start.
- **HTTP** — `http://127.0.0.1:4747/mcp` while `basics ui` is running. Streamable HTTP with `mcp-session-id`
  sessions; the server drops inactive ones.

Pass the vault as an absolute path for stdio. If you omit it, `basics-mcp` resolves it like the CLI: `BASICS_DIR`,
then the global config, then `~/basics-vault`.

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

Prompts are MCP prompts the client can insert into the conversation:

| Prompt | Effect |
| --- | --- |
| `plan-stack` | takes the project description, reads `get_vault_overview` and `recommend_stack`, reads the deciding notes, proposes one tech per layer with reasons from the vault, and asks for confirmation before writing files |

Inputs, defaults and minimal calls for each tool are in the [MCP tools reference](../reference/mcp-tools.md). After
changing a client config, restart the client; tools appear only when the connection succeeds.
