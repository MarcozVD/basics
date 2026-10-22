# Contributing to Basics

Thanks for taking the time to contribute. This guide covers the local setup, the scripts, changesets, commit style
and how to propose a pack.

## Setup

Requirements: Node.js >= 20.11 and npm (or pnpm).

```bash
git clone https://github.com/MarcozVD/basics.git
cd basics
npm install        # or: pnpm install
npm run build
```

The repo is an npm/pnpm workspace: `packages/core` (library), `packages/basics` (CLI, HTTP API and MCP server),
`packages/ui` (React + Vite), `packs/` (official note packs) and `site/` (VitePress docs).

## Scripts

| Script | What it does |
| --- | --- |
| `npm run build` | Build core, basics and the UI, then copy the UI and packs into the CLI package |
| `npm test` | Vitest suite (once); `npm run test:watch` for watch mode |
| `npm run e2e` | Playwright end-to-end tests; run `npm run build` first |
| `npm run lint` | Biome lint and format check (`npm run format` applies fixes) |
| `npm run typecheck` | TypeScript check without emitting |
| `npm run eval` | Recommendation eval over the official packs (`--hybrid`, `--grid`, `--json`) |
| `npm run gen:reference` | Regenerate `site/reference/` from the code |
| `npm run docs:dev` | VitePress dev server for the docs site (`npm run docs:build` to build it) |

Before opening a pull request, run at least `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`.
If you changed the UI, also run `npm run e2e`.

## Changesets

User-facing changes need a changeset:

```bash
npx changeset          # or: npm run changeset
```

Pick the affected packages and the bump type (patch, minor, major), and write a short description of the change.
Commit the generated `.changeset/*.md` file with your code. `npm run version-packages` is run by the maintainer at
release time; do not bump package versions by hand.

## Commit style

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add pack update proposals
fix: reject non-local Host headers
docs: document the stability contract
chore: bump vitest
```

Keep the subject under ~72 characters, use the imperative mood, and put the "why" in the body when it is not obvious.
One logical change per commit and per pull request.

## Propose a pack

Official packs live in `packs/<name>/`:

```
packs/my-pack/
  pack.json
  notes/
    en/            # layers/, tech/, practices/, checks/, profiles/
    es/            # same note ids as en/
```

`pack.json` declares `name` (lowercase letters, digits and dashes, matching the folder), `version` (dot-separated
numbers), per-language `description`, `requires` (pack dependencies) and `languages` (at least one, each with a
`notes/<lang>/` folder). Rules:

- Every declared language uses the same note ids, so switching language keeps links and `basics.json` stacks valid.
- Notes are normal notes: they must pass `basics validate`.
- Reference other notes by id with `[[wikilinks]]` and `practices` / `checks` lists.
- Bump `version` on every change — `basics pack update` compares versions to propose the diff.
- Ids are global; a pack note that collides with an existing vault note is skipped at install.

To propose a new pack, open a **Pack proposal** issue describing the stack it covers and who maintains it, or send a
pull request with the pack folder and a changeset. See the [packs guide](https://marcozvd.github.io/basics/guide/packs.html)
for the full format.

## Questions

Open a bug or feature issue with the templates, and check the [documentation](https://marcozvd.github.io/basics/)
and [troubleshooting guide](https://marcozvd.github.io/basics/guide/troubleshooting.html) first.
