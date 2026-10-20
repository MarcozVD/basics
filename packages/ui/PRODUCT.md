# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A solo developer who works with several AI coding agents (Claude Code, Cursor, opencode, ...). They open the Basics UI in short sessions next to their IDE to curate their tech-stack knowledge, review what agents propose, and pick a stack when starting a new project. Desktop, keyboard-heavy, often while agents are running in other windows.

## Product Purpose

Basics is a personal stack memory for coding agents. The user records their stack — layers, technologies (when to use / avoid / where they perform best), best practices, validation checks, stack profiles and past projects — as Markdown notes in a local vault. Agents read it through MCP (stdio or HTTP) and file exports (AGENTS.md, CLAUDE.md, Cursor rules), and propose new knowledge back. Success: agents build projects the way the user would, and the vault gets smarter after every project.

## Positioning

The UI is the control room of a loop no note app has: the user defines knowledge → agents consult it via MCP → agents propose learnings into an inbox → the user reviews a diff and approves. Writing and linking notes (Obsidian-like editor, graph) serves that loop; it is not the point by itself.

## Operating Context

- Runs locally: `basics ui` serves the app on 127.0.0.1:4747; the vault is a folder of Markdown + YAML frontmatter files, versioned with git, editable in any editor.
- Changes on disk (by the user, an editor, or an agent) appear live in the UI; concurrent edits are detected by hash.
- Typical flows: review inbox proposals (diff → approve / edit & approve / reject); edit a technology note; get a stack recommendation for a project description and export STACK.md; explore what links to what.

## Capabilities and Constraints

- Note types: layer, tech, practice, check, profile, project. Terminology is fixed in English in data; UI is localized EN/ES.
- Recommendation is keyword-based today (embeddings planned); the UI must present it as a shortlist with reasons, not a verdict.
- Agents never write directly to the vault; everything goes through the inbox.
- Local-only, no accounts, no telemetry, no network calls except explicit downloads.
- Undecided: community packs, project tracking UI (M4), embeddings UI (M5).

## Brand Commitments

- Name: **Basics**. Open source (MIT).
- Binding visual reference chosen by the user: the beUI component library and motion language (https://beui.dev/components/motion, MIT © 2026 Saurabh Chauhan). Components are vendored from its shadcn registry; missing components must follow the same concept.

## Evidence on Hand

- Example vault in `examples/vault` (Spanish content: FastAPI, React, PostgreSQL, Playwright, ...). No users, testimonials, metrics or screenshots exist yet; do not fabricate them.

## Product Principles

1. The agent loop is the hero: inbox, proposals and provenance (`source: agent:<name>`) are always visible and one keystroke away.
2. Files are the truth: never hide that notes are plain Markdown on disk; show ids and paths.
3. Shortlists with reasons, never black-box answers.
4. Keyboard-first and fast: every action reachable without the mouse; ⌘K everywhere.
5. Live and safe: reflect disk changes instantly and never silently overwrite someone else's edit.

## Accessibility & Inclusion

WCAG 2.2 AA contrast in both themes, full keyboard operation with visible focus, `prefers-reduced-motion` respected by every animation, EN/ES.
