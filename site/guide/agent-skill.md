# Agent skill

The MCP server gives coding agents the tools; the Basics skill tells them when to use each one. It is a single
`SKILL.md` in the [Agent Skills](https://agentskills.io) format, in the repository at
[`skills/basics/SKILL.md`](https://github.com/MarcozVD/basics/blob/main/skills/basics/SKILL.md).

With the skill installed, the agent:

- picks a new project's stack with `recommend_stack`, reads the candidates and explains the choice;
- loads `get_stack_context` (or `STACK.md`) before changing code and runs the listed checks before calling work done;
- searches the vault before proposing notes, and records project outcomes for review in the inbox.

The skill needs the MCP server connected; see [MCP clients](./mcp-clients.md).

## Install

Copy the `skills/basics` folder into the agent's skills directory.

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
