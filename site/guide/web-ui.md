# Web UI

```bash
basics ui                    # serves http://127.0.0.1:4747 and opens the browser
basics ui --port 5000        # another port
basics ui --no-open          # do not open the browser
```

The UI works on the same files as the CLI and watches the vault, so edits made outside the browser show up without a
reload. The server keeps the parsed vault in memory and reloads it only when a note file changes, so the next request
sees the edit and requests stay fast on large vaults.

## Screens

Navigation is a floating dock at the bottom: Home, Explore, Projects, Graph, Inbox (with the pending count), Recommend and Skills. There
are no sidebars; secondary panels are overlays closed with `Esc`. **Settings** is not in the dock: open it with the gear
in the header or with `Ctrl`/`⌘+,`.

| Screen | What it does |
| --- | --- |
| **Home** | Pending proposals you can approve inline, the agent activity timeline, and vault health (notes per type, broken links, orphans, recent notes). Each broken link can open the note that holds it or create the missing note. An empty vault shows the starter-pack onboarding. |
| **Explore** | Filters by layer and type with counts, search, list or grid, keyboard navigation, and the new-note dialog. |
| **Projects** | Project notes, filtered by status with counts. The status chip on each row is a menu: Active, Paused, Done or Archived. Done projects sort last and collapse into a `Done (N)` group in the All view. |
| **Editor** | Frontmatter form generated from the note type, Markdown body in edit / preview / split, `[[` wikilink autocomplete, connections (links, backlinks, unresolved) and a local graph. A conflict banner appears if the file changed on disk. |
| **Graph** | Every note and link, with type and layer filters in a floating toolbar, node search, broken links and neighborhood focus. Coming back to Graph shows the picture you left, with the same positions and zoom, without laying it out again; a reload keeps the positions for the same vault. Vault changes still update it. On a graph over 300 notes the layout runs in the background, so you can click and open notes while it settles, and zoomed-out labels show only the best-connected notes. |
| **Inbox** | Proposals with a side-by-side or unified diff; Approve, Edit and approve, or Reject. Pack proposals are grouped with **Approve all**. |
| **Settings** | Six sections: **General** (language, theme, vault path; in the [desktop app](desktop) also **Open folder** and **Change folder**), **Startup**, **Agents** (connect or disconnect each coding agent and see the file change it makes), **Search** (semantic search on or off), **Updates** and **About**. Each change applies as soon as you pick it; there is no Save button. Startup and Updates are desktop-only; see [Desktop settings](desktop#desktop-settings). |
| **Skills** | Every skill installed for your coding agents, grouped by area: filter by agent or area, search by name and description, change a skill's area, and expand a row for its path and version. |
| **Recommend** | Project description and layers → profiles and per-layer candidates with `use_when`, `performs_best` and `avoid_when`, selection, and the export modal with **STACK.md / AGENTS.md / CLAUDE.md / Cursor** tabs, each with copy or download. Shows whether the mode is **Keywords** or **Hybrid** and the score breakdown. An **Ask an agent** run is kept per browser tab: it keeps going when you leave the page, and the Dock shows its progress. |

## Shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl`/`⌘+K` | Command palette: search notes and proposals, jump to any screen, run actions (including copying the MCP command) |
| `Ctrl`/`⌘+,` | Open Settings |
| `g` then `h` / `e` / `p` / `g` / `i` / `r` / `k` | Go to Home / Explore / Projects / Graph / Inbox / Recommend / Skills |
| `Ctrl`/`⌘+S` | Save the note in the editor |
| `Ctrl`/`⌘+F` | Focus search in Explore and in the graph. In the [desktop app](desktop) it opens the command palette search instead |
| `↑` / `↓`, `Enter` | Move through lists (Explore, Inbox, palette) and open |
| `a` / `r` | Approve / reject the selected proposal in the Inbox |
| `a` / `e` / `r` | Approve / edit and approve / reject in a proposal |
| `Ctrl`/`⌘+Enter` | Run the recommendation |

## Live updates and preferences

The server watches the vault and pushes changes over SSE, so Home, Explore, Graph and Inbox update as files change. A
language selector switches the UI between EN and ES, and the theme toggle switches light and dark. Settings → General
has the same language and theme choices, plus the vault path. Settings → Search turns semantic search on or off, the same
as `basics embeddings enable` and `basics embeddings disable`.

## Security

`basics ui` listens on `127.0.0.1` only and rejects requests whose `Host` or `Origin` is not localhost. There is no
login because the server is local; do not expose it through a proxy, tunnel or port forward.

While the UI runs, the same port serves MCP over HTTP at `http://127.0.0.1:4747/mcp`; see
[MCP clients](./mcp-clients.md).

## Development

From the repo, run `basics ui --no-open` for the API and `npm run dev:ui` for Vite with a proxy to it. The end-to-end
suite runs with `npm run e2e` and needs `npm run build` first.
