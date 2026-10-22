---
layout: home

hero:
  name: Basics
  text: Your stack, remembered.
  tagline: A personal tech-stack vault in plain Markdown. Coding agents read it over MCP, propose changes to an inbox, and never write behind your back.
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: How it works
      link: /guide/concepts

features:
  - title: A vault you can read
    details: Notes are Markdown with YAML frontmatter and [[wikilinks]]. Open the folder in Obsidian, diff it in git, or read it in any editor. No database, no lock-in.
  - title: Agents that ask first
    details: Every write from an agent lands in inbox/ as a proposal with a reason and a diff. You approve it in the CLI or the web UI, and the note keeps its provenance.
  - title: From stack to project files
    details: Rank technologies per layer from a project description, export STACK.md, AGENTS.md, CLAUDE.md and Cursor rules, then run the stack checks in the project.
---

## Quick start

```bash
# create a vault with the official packs and open the web UI
npx @marcozvd/basics init ~/basics-vault --yes
npx @marcozvd/basics --vault ~/basics-vault ui
```

Connect an agent, ask it to recommend a stack, and review what it proposes in the Inbox.

- [Install and create your first vault](./guide/getting-started.md)
- [Learn the vault, note types and the agent loop](./guide/concepts.md)
- [Connect Claude Code, Cursor, VS Code, Codex or Windsurf](./guide/mcp-clients.md)
- [Browse every command and MCP tool](./reference/cli.md)
