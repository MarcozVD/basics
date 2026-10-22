# Packs

A pack is a versioned bundle of notes. Official packs ship with the CLI; you install into your vault and later pull
changes through the inbox.

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
| `python-api` | Python, FastAPI, pytest, PostgreSQL + practices and checks | `core-layers` |
| `profiles` | the `ml-api` and `saas-web` profiles | `web-typescript`, `python-api` |

Each pack ships the same note ids in every language it declares (`notes/en` and `notes/es`). Installing notes whose ids
already exist in the vault skips them, so a pack never overwrites your edits.

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

## Author a pack

The official packs live under `packs/<name>/` in the repository, with this layout:

```
packs/my-pack/
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
| `name` | lowercase letters, digits and dashes; must match the folder name |
| `version` | dot-separated numbers, compared numerically (`1.10.0` is newer than `1.9.0`) |
| `description` | short text per language |
| `requires` | packs installed before this one, recursively |
| `languages` | at least one; every language needs a `notes/<lang>/` folder |

Rules for the notes:

- Every declared language uses the same ids, so switching language keeps links and `basics.json` stacks valid.
- Notes must pass `basics validate`; a pack note is a normal note with `type` and its type's fields.
- Reference other notes by id, with `[[wikilinks]]` in bodies and `practices` / `checks` lists in frontmatter.
- Ids are global. A pack note that collides with an existing vault note is skipped at install.
- Bump `version` on every change: `pack update` compares the installed version with the shipped one and proposes the
  diff. Installed notes are tracked by `source: pack:<name>@<version>`.
