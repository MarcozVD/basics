---
"@marcozvd/basics": minor
---

Add a Settings page to the web UI and the desktop app. Open it from the gear in the header or with `Ctrl`/`⌘+,`.

- **General**: language, theme, and the vault path, with a copy button.
- **Agents**: connect or disconnect each coding agent with one button, see its state, and read the file change under "Show what changes".
- **Search**: turn semantic search on or off, with download size, progress, and index counts. Turning it off keeps the downloaded files. The new `POST /api/embeddings/disable` endpoint does this.
- **Startup** and **Updates** are desktop-only; in a browser they explain that and link to the desktop guide.
- **About**: version, vault path, and links to the docs, GitHub, and third-party licenses.
