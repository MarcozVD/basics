# Skills

A skill is a folder with a `SKILL.md` file that a coding agent loads when a task matches it. Basics does not install or
run skills. `basics skills` lists the ones already installed for your agents, grouped by area, so you can see what each
agent can use.

```bash
basics skills          # table of agents and folders, then the skills grouped by area
basics skills --json   # the same data as JSON
```

## Where it looks

Only user-level folders are read. Project-level skills are not listed.

| Agent | Folder read |
| --- | --- |
| Claude Code | `~/.claude/skills/*/SKILL.md`, plus skills from plugins installed for you (`~/.claude/plugins/installed_plugins.json`) |
| OpenCode | `~/.config/opencode/skills` |
| Codex | `~/.codex/skills` |
| Shared | `~/.agents/skills`, read by both OpenCode and Codex and shown as **Shared** |

A skill that appears in more than one place, with the same name and the same `SKILL.md`, is listed once with every agent
that has it. A skill with the same name but different content stays as a separate row.

Basics reads these files and never writes to them. It reads YAML or JSON frontmatter only. A file whose frontmatter is
written in JavaScript or CoffeeScript is not run; it is listed with an error instead. A `SKILL.md` larger than 256 KB is
listed with an error too, and the list stops at 500 skills. One broken skill does not hide the others.

## Areas

Each skill is placed in one area: **Frontend**, **Backend**, **Security**, **Testing**, **DevOps**, **Data**,
**AI & agents**, **Docs & writing**, **Workflow** or **Other**. The area comes from the skill's `category` or first
`tags` entry when it names one, and otherwise from words in its name and description. A skill that matches no area goes
to **Other**.

To move a skill to another area, use the web UI or the HTTP API:

```bash
curl -X PUT http://127.0.0.1:4747/api/skills/<key>/area -H 'content-type: application/json' -d '{"area":"security"}'
curl -X DELETE http://127.0.0.1:4747/api/skills/<key>/area   # back to the detected area
```

The `<key>` is the id shown by `basics skills --json`. The change is saved in the Basics config as `skills.areas`, never
in the skill file. An entry keyed by a skill you have uninstalled is harmless; `DELETE` removes it.

## In the app

The web UI and the desktop app have a **Skills** page in the sidebar (press `G` then `K`, or pick **Skills** in the command
palette). It shows the same list as `basics skills`:

- **Agent chips** narrow the list to one agent: **All**, **Claude Code**, **opencode**, **Codex** or **Shared**. Each shows
  how many skills it has. A chip that would show nothing is disabled.
- **Area chips** narrow the list to one area. The chosen area is in the address as `?area=<id>`, so a reload, the back
  button and a shared link keep the filter. The agent chips, the area chips and the search combine.
- **Search** matches skill names and descriptions, and ignores case and accents. It does not look at file paths.
- The **All** view shows the areas in a fixed order, with five skills each. **Show all N** opens a whole area; **Show
  fewer** closes it again. Choosing an area chip shows that area alone with no preview.
- Each row shows the skill name, the agents that have it, the plugin it came from if any, and **Changed by you** when
  its area was set by hand. Expanding a row shows its `~/...` path, which you can copy, and its version.
- The area menu on a row moves the skill to another area. The change is saved in `skills.areas`, and **Changed by you**
  appears. The reset control on that row restores the detected area.
- If no agent folder is found, the page links to Settings → Agents. If agents are found but hold no skills, it shows how
  to install one. If a filter matches nothing, it offers to clear the filters.
- If the Basics skill is missing from an agent, the page says so and links to Settings → Agents, where you can install it.

## Installing a skill

Install skills with the tool your agent uses. For example, `npx skills add <repo>` installs a skill from a repository
into the shared folder. Run `basics skills` again to see it.

The Basics skill itself is covered in [Agent skill](agent-skill).
