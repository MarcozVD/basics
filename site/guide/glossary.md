# Glossary

The words Basics uses, in plain language. Entries are in reading order: each one only uses terms explained above it. For how the pieces fit together, read [Concepts](./concepts.md).

## Agent

The AI tool that writes code for you, such as Claude Code, Codex, Cursor or OpenCode. An agent can use the tools you connect to it, and Basics is one of those tools.

## Vault

The folder on your computer where Basics keeps what it knows about how you build things. It holds plain Markdown files (text with light marks for headings and links), so any editor can open it, and you can keep it under version control (git).

## Note

One Markdown file in the vault that describes one thing, such as a technology or a project. The file name without `.md` is the note's id, and other notes link to it by writing `[[id]]`.

## Tech

A technology you can use in a project, such as a language, a framework, a library or a database. A tech note says when to use it and when to avoid it, and links to the rules and commands that go with it.

## Layer

One part of an application, such as backend, frontend, data, infrastructure, testing, mobile or ml. A tech can belong to one or more layers, and Basics ranks techs against each other inside a layer.

## Stack

The set of techs a project uses, grouped by layer. For example, a web framework for the backend and PostgreSQL for the data layer.

## Check

A command that verifies the work, such as a type check, a linter or a test run. The vault says which checks belong to each tech, and the agent runs them before it says the work is done.

## Project

A real folder on your disk that you are building, such as a web app or an API. Basics keeps a project note for it, with the project's stack, its lessons and the results of its last checks.

## Practice

A rule for using a tech well, such as validating input where it enters the app. A practice can apply to several techs, and the agent follows it while it writes code.

## Profile

A named stack for one kind of project, such as an API with a database. When Basics suggests techs, a matching profile is listed first.

## Pack

A versioned bundle of notes that you install into your vault. Basics ships official packs, and anyone can publish a pack in a GitHub repository. Community packs change nothing until you review and approve them.

## Recommend

Basics' ranking of techs for a project description, one layer at a time. Treat the ranking as a shortlist to check, not as the decision.

## Proposal

A change that an agent or a pack update wants to make to the vault, such as a new note or an updated one. Each proposal comes with a reason, and nothing changes until you approve it.

## Inbox

Where proposals wait for your decision: the inbox folder in the vault, and the Inbox page of the web UI. You review each change, then approve it or reject it.

## Project history

What your finished projects say about a tech. Each project that used a tech casts one small vote for it: +1 when it succeeded, -1 when it failed or was abandoned. [Recommend](./recommend.md#project-history) uses the votes only to nudge close calls. You can switch them off, or change their strength, in Settings → Search.

## Skill

A folder with a `SKILL.md` file that teaches an agent when to do something, such as when to call a Basics tool. When you run `basics connect`, Basics installs its own skill for the agents that support skills.

## MCP

Model Context Protocol, an open standard that lets an agent use outside tools and data. Basics runs an MCP server, so your agents can search the vault and send proposals to the inbox.
