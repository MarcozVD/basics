# Notes

## Write a note by hand

A note is one Markdown file in its type's folder (`tech/`, `practices/`, ...). Its id is the filename without `.md` and
must be unique across the vault; that id is what `[[wikilinks]]` point at.

```bash
basics new tech django -l backend     # scaffold from the template
basics list --type tech               # see what exists
basics search "rest api"
```

A tech note, for example:

```markdown
---
type: tech
kind: framework
layer: backend
language: python
use_when:
  - REST or JSON API
avoid_when:
  - server-rendered HTML pages
performs_best:
  - high I/O concurrency
related: [postgresql, pytest]
practices: [fastapi-structure]
checks: [fastapi-endpoint-tests]
tags: [api, rest]
---

Async framework on top of Starlette. See [[fastapi-structure]].
```

Every note type has its own fields. Unknown frontmatter fields are preserved when the note is read and rewritten, so you
can add your own. The full list is in the [schema reference](../reference/schema.md).

## Write a note in the UI

Open **Explore**, press the new-note button (or `Ctrl`/`⌘+K` → New note), pick a type and fill the generated form. The
editor has:

- a properties form built from the note type, including the layer, language and wikilink lists;
- a Markdown body with edit, preview and split modes;
- `[[` autocomplete for wikilinks, and a connections panel with links, backlinks and unresolved links;
- a local graph of the open note;
- `Ctrl`/`⌘+S` to save.

If the file changed on disk while you were editing, saving shows a conflict banner with **Reload** or **Overwrite**.
Live updates from the vault (SSE) keep the rest of the UI in sync; see [Web UI](./web-ui.md).

## Wikilinks

Use `[[note-id]]` anywhere in a body. The target is a note id, not a path. Backlinks are derived automatically, and
links to missing notes show up as broken.

```markdown
[[fastapi]] · [[postgresql]] · [[fastapi-structure]]
```

Practices and checks are referenced by plain id in frontmatter (`practices: [fastapi-structure]`), not as wikilinks.

## Validate

```bash
basics validate
```

Checks frontmatter against the schema for each type, duplicate ids and broken links. Run it after hand-editing or
after reviewing a batch of proposals. The [schema reference](../reference/schema.md) is generated from the same code
that performs the validation.
