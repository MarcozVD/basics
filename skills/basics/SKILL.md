---
name: basics
description: Use the Basics MCP server (tools like recommend_stack, get_stack_context, detect_stack, propose_note) to pick a project's tech stack from the user's own vault, follow its practices and checks while coding, and record what was learned. Use when starting a new project, choosing or changing technologies, working in a project that has STACK.md or basics.json, or when the user mentions Basics, their stack vault or their stack notes.
---

# Basics

Basics is the user's stack vault: Markdown notes about the technologies they use, when to pick each one, the
practices to follow and the checks that prove the work is done. You reach it through the `basics` MCP server.

If the `basics` tools are not available, tell the user to connect the server (`claude mcp add --transport http basics
http://127.0.0.1:4747/mcp` while `basics ui` or the desktop app is running) and stop; do not imitate the tools.

## Rules

- **The vault beats general knowledge.** When a vault note covers a decision, follow it. If you disagree, say so and
  explain why, but do not silently pick something else.
- **Nothing is applied directly.** `propose_note` and `record_project_outcome` put proposals in the vault inbox for the
  user to review. Say "proposed for review", never "added" or "saved".
- **Never overwrite project files.** Templates and exported files are written only where no file exists yet, except the
  marked `<!-- basics:start -->` … `<!-- basics:end -->` blocks that `export_project` merges.
- **Search before you propose.** Run `search_vault` first so you update an existing note instead of creating a
  duplicate.
- Pass your client name as `agent` (for example `claude-code`). Names starting with `pack:` are reserved.

## New project

1. `search_vault` and `list_layers` to see what the user already knows and uses.
2. `recommend_stack` with the project description. Treat the result as a shortlist, not an answer.
3. Read the top candidates with `get_note` (their `use_when`, `avoid_when` and `performs_best`), choose one per layer and
   explain the choice to the user in a few lines. Wait for their OK when the choice is not obvious.
4. `get_stack_context` with the chosen tech ids. Keep that document as your working rules for the project.
5. `get_check_templates` and write the files that do not exist yet.
6. `export_project` with the stack. Send the current contents of `AGENTS.md`, `CLAUDE.md` or Cursor rules in `existing`
   so the user's own text survives, then write the returned files into the project root.

## Existing project

1. If the project has `STACK.md`, read it: it is the compiled context. If it has `basics.json`, its `stack` lists the
   tech ids.
2. Otherwise run `detect_stack` on the project directory and confirm the detected technologies with the user.
3. `get_stack_context` with those ids (and `versions` from `basics.json` or `detect_stack`) before you change code.

## While coding

- Follow the practices in the stack context. When a practice conflicts with what the user asks, point it out and let
  them decide.
- Before you say the work is done, run the checks listed in the stack context and report each result. A failing check
  means the work is not done.

## Teaching the vault

- When you learn something worth keeping (a pitfall, a version quirk, a better default), `search_vault` for the note,
  then `propose_note` with the full frontmatter and body and a one-line `reason`. Link related notes with `[[id]]`.
- At the end of meaningful work on a project, `record_project_outcome` with a short summary, the lessons and any
  `tech_updates`. The project id is the `project` field in `basics.json`; if there is no project note, propose one with
  `propose_note` (type `project`) first.
- `list_proposals` shows what is still waiting for review; do not propose the same change twice.
