# Comparison

Basics is one way to give a coding agent your rules and decisions. This page sets it against the options most people already use, says what each one does better, and says when Basics is the wrong choice. The comparison lists strengths and limits. It has no measurements.

## At a glance

| Option | What it is | Does better | Does worse | Pick it when |
| --- | --- | --- | --- | --- |
| **Basics** | A [vault](./glossary.md#vault) of notes about your techs, practices and checks, read by your agents over [MCP](./glossary.md#mcp). Agent changes wait for your approval in the [inbox](./glossary.md#inbox). | Reuses the same decisions across projects and agents. Ranks techs per layer. Keeps agent changes behind an approval step. Runs checks. | Takes setup: install the CLI or the desktop app, connect your agents, keep the notes current. The vault is a folder outside the project. | You start several projects with the same tools, or you want one place for your decisions that every agent can read. |
| **Cursor rules** | Markdown rule files in `.cursor/rules/` that Cursor adds to its AI context, always or when files match a pattern. | Nothing to install. The rules live in the repo and travel with it. A rule can apply to some files only. | Only Cursor reads them. Nothing is shared between projects. Nothing reviews what an agent adds to them, and there are no checks. | You use Cursor alone, on one repo. |
| **Memory bank** | A set of Markdown files, such as a project brief and a progress log, that the agent reads at the start of a session and updates as it works. | Keeps the working context of one long project across sessions. Lives in the repo, and the agent maintains it. | Covers one project. No ranking of techs. The agent writes directly, so you review its changes through version control. Only agents that follow the pattern read it. | One long project where the agent should keep its own running notes. |
| **AGENTS.md or CLAUDE.md** | One plain Markdown file at the root of the repo with instructions for the agent. Many coding agents read `AGENTS.md`; Claude Code reads `CLAUDE.md`. | The simplest option: one file, no tools, no server. Teammates review it in a pull request like any other code. | You copy it by hand into each project. No ranking, checks or approval step. It goes stale unless someone keeps it up to date. | One project, or a team that wants the rules in the repo. |

## Where Basics is the wrong choice

Use one of the simpler options when:

- **You work on one project.** A vault pays off when decisions carry over to the next project. If everything stays in one repo, a plain `AGENTS.md` or `CLAUDE.md` does the same job with much less setup.
- **Only one agent reads your rules.** If only Claude Code or only Cursor will ever use them, use that tool's own file. Basics helps most when several agents need the same answers.
- **You will not reuse anything.** If the next project uses other techs and you do not want the notes, the vault is overhead. Write the rules where the code is.
- **Your agent cannot use MCP.** Basics can still export `AGENTS.md`, `CLAUDE.md` and Cursor rules. The loop where agents read the vault and propose changes needs MCP.

## Use them together

Basics does not replace these files. `basics export` writes `STACK.md` from your vault and, for the targets you choose, `AGENTS.md`, `CLAUDE.md` and `.cursor/rules/stack.mdc`. In `AGENTS.md` and `CLAUDE.md` it only changes a marked block, so text you wrote outside that block stays as it is. See [Projects and checks](./projects-and-checks.md) for the export options.
