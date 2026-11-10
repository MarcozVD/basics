# Agent skill

The MCP server gives coding agents the tools; the Basics skill tells them when to use each one. It is a single
`SKILL.md` in the [Agent Skills](https://agentskills.io) format, in the repository at
[`skills/basics/SKILL.md`](https://github.com/MarcozVD/basics/blob/main/skills/basics/SKILL.md).

With the skill installed, the agent:

- reads the whole vault catalog with `get_vault_overview` and cross-checks it with `recommend_stack`, then decides one
  tech per layer, preferring a matching profile and the lessons of past projects;
- explains each pick with the vault note that justifies it (`[[id]]` and its `use_when`), names the alternatives it
  ruled out from their `avoid_when`, proposes any note the decision needs that the vault is missing, and asks one
  confirmation question before writing any file;
- loads `get_stack_context` (or `STACK.md`) before changing code and runs the listed checks before calling work done;
- searches the vault before proposing notes, and records project outcomes for review in the inbox.

Where the client supports MCP prompts, `plan-stack` is the one-command entry: give it the project description and it
walks the whole flow above.

The skill needs the MCP server connected; see [MCP clients](./mcp-clients.md).

## Roles in an orchestrated team

The skill asks each agent once per conversation whether it is a specialised agent in an orchestrated team: an
orchestrator (or `lead`), a `dev`, a `tester`, or another named role. An agent with no assigned role, or one that does
not answer, keeps the single-agent workflow above.

An agent with a role declares it once, in the optional `workflow` argument of the first entry call it makes:

| Role | Declares on | What it gets |
| --- | --- | --- |
| Orchestrator (or `lead`) | `get_vault_overview`, when planning | The planning workflow: a cross-check with `recommend_stack`, the deciding notes, stack approval before any file is written, the project files exported before the team starts, and a handoff with stack IDs, versions, practices and check commands. |
| Dev | `get_stack_context`, with the project's tech IDs | The rules for working inside the approved stack: run the checks, and propose a learning only when it is reproducible and useful. |
| Tester | `get_stack_context`, with the project's tech IDs | Run the checks independently and report each one's status and exit code. A failing or blocked check is never reported as a success, and the outcome goes to the inbox for review. |
| Other named role | `get_vault_overview` or `get_stack_context` | The scope it was assigned, and nothing more. The name is a label, not instructions. |

The guidance comes back as a second text block after the usual result, headed `Basics workflow v1: <role>`. The first
block is unchanged. Later calls leave `workflow` out and return the usual result, and the agent keeps its guidance in
the conversation. If it loses the guidance, for example after a reconnect, it can declare the role again to fetch it
without answering the role question again.

A role grants no permissions. What an agent may edit is still set by its own configuration and assignment, and
approving proposals stays with you. Basics stores no role on the server, so two agents sharing one HTTP connection
cannot inherit each other's role, and a client name is never treated as a role.

Agents that do not declare a role, or that declare `general`, get the same tools, descriptions and results as before.
The only change they can see is the optional `workflow` property in the input schema of those two tools.

### Checking the role workflows

The deterministic check runs in CI and needs no agents or API keys:

```bash
npm run eval:agent-roles
```

It runs a scripted team scenario against a temporary vault and project, checks the role contract, and confirms that
deliberately broken runs fail.

The live check runs the real agents by hand, one conversation each: Claude Code as orchestrator, Codex as dev and
opencode as tester. It makes paid model calls, so run it only when you mean to:

```bash
npm run eval:agent-roles -- --live
```

It needs the `claude`, `codex` and `opencode` CLIs on your `PATH`, the environment variables `ANTHROPIC_API_KEY`,
`OPENAI_API_KEY` and `BASICS_EVAL_OPENCODE_MODEL` set explicitly, and the Playwright Chromium and Firefox browsers
(`npx playwright install chromium firefox`). If anything is missing, the run stops with `BLOCKED` before any agent
starts and exits with code 2. A `BLOCKED` run is never a pass. The live run does not read your agents' login files.

## Install

`basics connect` installs the skill together with the MCP server, for every agent it detects:

```bash
basics connect             # server + skill
basics connect --no-skill  # server only
```

`basics disconnect` removes the skill again, along with the server entry; `--no-skill` keeps the skill. Any other files
in the skill folder are kept. See [MCP clients](./mcp-clients.md).

To install it by hand, copy the `skills/basics` folder into the agent's skills directory.

| Agent | Directory |
| --- | --- |
| Claude Code | `~/.claude/skills/basics/`, or `.claude/skills/basics/` inside one project |
| OpenCode | `~/.config/opencode/skills/basics/` |
| Codex | `~/.codex/skills/basics/` |
| oh-my-pi | `~/.omp/agent/skills/basics/` |
| Gemini CLI | `~/.gemini/skills/basics/` |
| Qwen Code | `~/.qwen/skills/basics/` |
| Kimi CLI | `~/.kimi/skills/basics/` |
| Goose | `~/.agents/skills/basics/` |
| Amp | `~/.config/amp/skills/basics/` |

```bash
git clone --depth 1 https://github.com/MarcozVD/basics /tmp/basics
mkdir -p ~/.claude/skills && cp -r /tmp/basics/skills/basics ~/.claude/skills/
```

Restart the agent so it picks up the new skill.

To see the skills installed next to the Basics skill, run `basics skills`; see [Skills](skills).
