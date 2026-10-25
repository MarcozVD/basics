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

If the client supports MCP prompts, start with the `plan-stack` prompt and the project description: it runs the
whole flow below in one step. Otherwise follow these steps.

1. `get_vault_overview` for the whole catalog (layers, techs, profiles and past projects) and `recommend_stack` with
   the project description as a ranked cross-check. Treat the ranking as a shortlist, not the decision.
2. Decide yourself from the vault: one tech per needed layer. Prefer a matching profile when one fits. Prefer what
   past projects used successfully, and respect their lessons. If the decision needs something the vault does not
   have yet, fill the gap (see [Filling gaps](#filling-gaps)).
3. Tell the user the decision in this shape, one line per layer:

   `Vamos a usar: <layer>: <tech> — <reason from [[note]]>`

   Then list the alternatives you ruled out and why (from their `avoid_when`), and list any proposals you made
   ("Propuestas al Inbox: rustls, reqwest") saying nothing is applied until the user approves it. Ask ONE question —
   "¿Usamos este stack? / Shall we use this stack?" — before writing any file.
4. After the user says yes, `get_stack_context` with the chosen tech ids. Keep that document as your working rules for
   the project.
5. `get_check_templates` and write the files that do not exist yet.
6. `export_project` with the stack. Send the current contents of `AGENTS.md`, `CLAUDE.md` or Cursor rules in `existing`
   so the user's own text survives, then write the returned files into the project root.
7. If the project has no project note, `propose_note` with type `project`, the stack by layer and the description.
   Say "proposed for review"; it lands in the vault inbox.

## Filling gaps

Sometimes the right decision uses a technology the vault has no note for, or a chosen note links to a `[[id]]` that
was never written. Close that gap with a proposal instead of quietly falling back on general knowledge.

1. `search_vault` for the missing note, then `get_note` on the closest hits: if a note already covers it, propose an
   update instead of a duplicate.
2. `propose_note` only the notes the decision actually uses — never a wish list.
3. Make each proposal useful on its own: correct `type`, and for a tech the right `kind` and `layer` (an existing
   layer id) plus `language` when it applies; at least 2 `use_when`, at least 1 `avoid_when`, `tags` and `related`.
   Link `[[id]]` in the body and `related` only to notes that exist or that you propose in the same answer. Write a
   body of 3–6 lines, specific: what it is, when it beats the alternatives already in the vault, and one concrete
   pitfall or setup note. The `reason` says which project decision needed it.
4. List the proposals in your answer ("Propuestas al Inbox: rustls, reqwest") and say they are proposed for review:
   nothing is applied until the user approves it in the Inbox.

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
