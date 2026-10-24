# Agent skill

The MCP server gives coding agents the tools; the Basics skill tells them when to use each one. It is a single
`SKILL.md` in the [Agent Skills](https://agentskills.io) format, in the repository at
[`skills/basics/SKILL.md`](https://github.com/MarcozVD/basics/blob/main/skills/basics/SKILL.md).

With the skill installed, the agent:

- reads the whole vault catalog with `get_vault_overview` and cross-checks it with `recommend_stack`, then decides one
  tech per layer, preferring a matching profile and the lessons of past projects;
- explains each pick with the vault note that justifies it (`[[id]]` and its `use_when`), names the alternatives it
  ruled out from their `avoid_when`, and asks one confirmation question before writing any file;
- loads `get_stack_context` (or `STACK.md`) before changing code and runs the listed checks before calling work done;
- searches the vault before proposing notes, and records project outcomes for review in the inbox.

Where the client supports MCP prompts, `plan-stack` is the one-command entry: give it the project description and it
walks the whole flow above.

The skill needs the MCP server connected; see [MCP clients](./mcp-clients.md).

## Install

`basics connect` installs the skill together with the MCP server, for every agent it detects:

```bash
basics connect             # server + skill
basics connect --no-skill  # server only
```

To install it by hand, copy the `skills/basics` folder into the agent's skills directory.

| Agent | Directory |
| --- | --- |
| Claude Code | `~/.claude/skills/basics/`, or `.claude/skills/basics/` inside one project |
| OpenCode | `~/.config/opencode/skills/basics/` |
| Codex | `~/.codex/skills/basics/` |

```bash
git clone --depth 1 https://github.com/MarcozVD/basics /tmp/basics
mkdir -p ~/.claude/skills && cp -r /tmp/basics/skills/basics ~/.claude/skills/
```

Restart the agent so it picks up the new skill.
