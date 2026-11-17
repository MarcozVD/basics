# Packs

A pack is a versioned bundle of notes, either **bundled** with the CLI or **community** packs you add from a GitHub
repository. Official packs install straight into your vault; community packs always land in the inbox for review.

## Install

```bash
basics pack list                              # version, installed version, note count
basics pack install core-layers python-api    # installs requirements too
basics pack install web-typescript --lang es  # Spanish notes
```

| Pack | Content | Requires |
| --- | --- | --- |
| `core-layers` | the five base layers (frontend, backend, data, infra, testing) | — |
| `web-typescript` | TypeScript, React, Next.js, Vitest, Playwright + practices and checks | `core-layers` |
| `python-api` | Python, FastAPI and pytest + practices and checks | `databases` |
| `databases` | PostgreSQL, SQLite and SQL migrations, shared by the API packs | `core-layers` |
| `rust-api` | Rust HTTP APIs: web frameworks, SQL libraries, Cargo test tools + practices and checks | `databases` |
| `go-api` | Go HTTP APIs: routers, SQL access, Go test tools + practices and checks | `databases` |
| `profiles` | the `ml-api` and `saas-web` profiles | `web-typescript`, `python-api` |

Each pack ships the same note ids in every language it declares (`notes/en` and `notes/es`). Installing notes whose ids
already exist in the vault skips them, so a pack never overwrites your edits.

## The databases pack

`databases` holds the notes that the API packs share: PostgreSQL, SQLite and SQL migrations. `python-api`, `rust-api` and
`go-api` all require it, so installing any of them also installs `databases` and `core-layers`:

```bash
basics pack install databases   # PostgreSQL, SQLite and SQL migrations, with core-layers
```

## The rust-api pack

`rust-api` holds notes for Rust HTTP services. It requires `databases`, which brings PostgreSQL, SQLite and the core layers
with it, so one command is enough:

```bash
basics pack install rust-api            # installs databases and core-layers too
basics pack install rust-api --lang es  # Spanish notes
```

It holds:

- **18 techs**: the Rust language, the Cargo test tools `cargo-test` and `cargo-nextest`, the web frameworks axum,
  actix-web, rocket, poem and warp, the data libraries sqlx, diesel, sea-orm and rusqlite, and serde, tokio, tracing,
  insta, proptest and wiremock-rs.
- **4 practices**: project layout, error handling, async runtime and data access.
- **3 checks**: `cargo fmt --all -- --check`, `cargo clippy --workspace --all-targets -- -D warnings` and
  `cargo test --workspace`.
- **The `rust-api` profile** (Rust HTTP API): axum on tokio with serde and tracing, sqlx on PostgreSQL, and cargo-test
  with proptest. It is a starting choice, not a requirement. When a description matches its use cases, the recommend step
  lists it first.

The pack can also ship sample compare tasks in an optional `tasks.json`. This pack has four: a login API, an inventory
API, a webhook inbox and a local notes service. Each task has a title and a prompt in every language the pack declares,
plus the layers it should touch. Installing the pack never runs them.

The file format, in short:

- `schema_version` is `1`. Unknown keys are rejected.
- Each task has an `id` (lowercase letters, digits and dashes, unique in the file), a `title` and a `prompt` with one
  text per pack language, and `expected_layers` (one or more layer ids, no repeats).

```json
{
  "schema_version": 1,
  "tasks": [
    {
      "id": "login-api",
      "title": { "en": "Rust login API", "es": "API de inicio de sesión en Rust" },
      "prompt": { "en": "Build a small Rust HTTP API ...", "es": "Crea una API HTTP pequeña en Rust ..." },
      "expected_layers": ["backend", "data", "testing"]
    }
  ]
}
```

## The go-api pack

`go-api` holds notes for Go HTTP services. It requires `databases`, which brings PostgreSQL, SQLite and the core layers
with it, so one command is enough:

```bash
basics pack install go-api            # installs databases and core-layers too
basics pack install go-api --lang es  # Spanish notes
```

It holds:

- **19 techs**: the Go language, the Go test tools `go-test` and `go-fuzzing`, the HTTP routers and frameworks net/http,
  chi, echo, fiber and gin, the data libraries and tools database/sql, pgx, sqlc, ent and gorm, and slog, zap, zerolog,
  testify, gomock and httptest.
- **4 practices**: project layout, error handling, context and concurrency.
- **3 checks**: `go vet ./...`, `golangci-lint run` and `go test -race ./...`.
- **The `go-api` profile** (Go HTTP API): net/http with slog, pgx on PostgreSQL, and go test with httptest. It is a starting
  choice, not a requirement. When a description matches its use cases, the recommend step lists it first.

The pack can also ship sample compare tasks in an optional `tasks.json`. This pack has four: a login API, an inventory API,
a webhook inbox and a local notes API. Each task uses the same format as the rust-api pack's tasks, shown above. Installing
the pack never runs them.

## Update

```bash
basics pack update                     # every installed pack
basics pack update python-api          # one pack
```

`pack update` never writes to the vault. It creates inbox proposals for the notes that are new or changed in the pack,
tagged `proposed_by: pack:<name>@<version>`. Notes the pack no longer includes are ignored. Review them like any agent
proposal:

```bash
basics inbox list
basics inbox show <id>
basics inbox approve-all --pack python-api
basics inbox approve-all --pack python-api --version 1.1.0
```

`--pack` is required; `--version` limits the batch to one pack version. In the UI, proposals from a pack are grouped with
an **Approve all** button.

## Updating from older packs

Some notes moved between packs in this release: PostgreSQL and SQL migrations moved from `python-api` to `databases`, and
SQLite moved from `rust-api` to `databases`. After you upgrade, `basics pack update` proposes the moved notes under
`databases`, along with the `databases` notes that the API packs now require. Expect a one-time batch of these proposals.
A moved note's proposal only changes where the note comes from. Your edits to the note stay as they are, and nothing
changes until you approve it. Review the batch like any other pack proposal, or approve it with
`basics inbox approve-all --pack databases`.

## Community packs

Add a pack from any public GitHub repo with `basics pack add` or the UI's "Add from GitHub" input on Home:

```bash
basics pack add acme/my-pack
basics pack add acme/my-pack@v2.1.0      # a specific branch, tag or commit
basics pack add acme/my-pack --path packs/docker --lang en   # a subdirectory holding the pack
```

`pack add` downloads `https://codeload.github.com/<owner>/<repo>/tar.gz/<ref>` (default `HEAD`), extracts it into
`<vault>/.basics/packs/<owner>/<repo>/` with a `source.json` describing the repo, ref, `--path` and version, and prints what
it proposed — for example:

```
added acme/my-pack@v2.1.0
3 new, 1 changed, 0 unchanged, 0 skipped, 1 invalid
  skipped invalid notes/en/layers/bad.layer.md: layer: invalid enum value
Review the proposals in the inbox (`basics inbox` or the UI) before installing.
```

### Review flow

Every note arrives as an **inbox proposal** from agent `pack:<owner>/<repo>@<version>` (updates come from the same
agent). Nothing is installed automatically:

```bash
basics inbox approve-all --pack acme/my-pack
```

or, in the UI, open the filtered inbox and hit **Approve all**. Once approved, notes get
`source: pack:<owner>/<repo>@<version>` and `pack_lang`, and `basics pack list` shows the installed version,
`pack update <owner>/<repo>` re-fetches the cached ref and proposes only the changed notes (a no-op when the version did
not increase), and `basics pack remove <owner>/<repo>` deletes the cache only — installed notes stay.

### Safety rules

A community pack is **untrusted content**: it is never executed and never written straight into the vault.

- Only `pack.json` and `notes/<lang>/<type-dir>/*.md` are read from the archive. Everything else — READMEs, scripts,
  config files, nested folders — is ignored.
- Limits: the whole archive is rejected if any file is **> 256 KB**, it has **> 1000 entries**, or it unpacks to
  **> 10 MB**.
- Symlinks, hard links, absolute paths and `..` segments are rejected.
- Note file names are limited to letters, digits, `.`, `_` and `-`; anything else is skipped and reported.
- Refs (branches, tags, commits) and `--path` cannot contain `..`.
- Every note is validated against the note schema; invalid notes are skipped and reported with the file and reason.
- Optional `GITHUB_TOKEN` is sent as a bearer header to raise GitHub's rate limits. It is never required and never
  prompted for.

So adding a pack never changes your vault by itself: what reaches it is an inbox proposal you review and approve or
reject. Read the diffs before approving, as you would any agent proposal.

### Check notes need trust

If a note carries a `command`, `basics check` asks for trust per directory + command before running it, exactly like any
other check note.

## Make your own pack

A pack is a directory in a Git repository with a `pack.json` manifest and Markdown notes under `notes/<lang>/<type-dir>/`.
Once your repo is public, anyone can add it with `basics pack add`.

```
my-pack/
  pack.json
  notes/
    en/
      layers/*.md
      tech/*.md
      practices/*.md
      checks/*.md
      profiles/*.md
    es/
      ... same ids as en/ ...
```

A note also needs to sit in the type directory it declares — `layers/`, `tech/`, `practices/`, `checks/`, `profiles/`,
`projects/`. Anything in other directories, or with other file names, is ignored.

`pack.json`:

```json
{
  "name": "my-pack",
  "version": "1.0.0",
  "description": {
    "en": "My stack notes",
    "es": "Mis notas de stack"
  },
  "requires": ["core-layers"],
  "languages": ["en", "es"]
}
```

| Field | Rules |
| --- | --- |
| `name` | display name for the manifest (the community pack id is always `owner/repo`); bundled packs require lowercase letters, digits and dashes matching the folder |
| `version` | dot-separated numbers, compared numerically (`1.10.0` is newer than `1.9.0`) |
| `description` | short text per language |
| `requires` | packs installed before this one, recursively |
| `languages` | at least one; every language needs a `notes/<lang>/` folder |

### A minimal example

```bash
mkdir my-pack && cd my-pack
```

```bash
mkdir -p notes/en/tech notes/en/checks
cat > pack.json <<'EOF'
{ "name": "my-pack", "version": "1.0.0",
  "description": { "en": "My stack notes" },
  "languages": ["en"], "requires": [] }
EOF
cat > notes/en/tech/redis.md <<'EOF'
---
type: tech
kind: database
title: Redis
layer: data
tags: [cache]
---
# Redis
EOF
```

Then publish your repo and install it from anywhere:

```bash
basics pack add <you>/my-pack
basics inbox list            # see the proposed notes
basics inbox approve-all --pack <you>/my-pack
```

### Language and versioning rules

- Every declared language uses the same ids, so switching language keeps links and `basics.json` stacks valid.
- Notes must pass `basics validate`; a pack note is a normal note with `type` and its type's fields.
- Reference other notes by id, with `[[wikilinks]]` in bodies and `practices` / `checks` lists in frontmatter.
- Ids are global. A pack note that collides with an existing vault note is skipped at install.
- Bump `version` on every change: `pack update` compares the installed version with the shipped one and proposes the
  diff. Installed notes are tracked by `source: pack:<name>@<version>`.
