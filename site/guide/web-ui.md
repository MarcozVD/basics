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

Navigation is a sidebar on the left by default: Home, Explore, Projects, Graph, Inbox (with the pending count), Recommend and
Skills, with **Settings** at the bottom. The top of the sidebar holds the vault folder and a search button that opens the command
palette. On windows 1280px and wider the sidebar shows the labels. From 768px to 1279px it is an icon rail, and hovering or
focusing an item shows its name, shortcut and purpose. Below 768px the sidebar is hidden; a menu button opens it as a drawer.
The collapse button or `Ctrl`/`⌘+B` switches between the full sidebar and the rail, and the choice is remembered in this browser.

**Settings → General → Navigation** switches to **Floating**: the same items in a bar that you can move. Drag its grip (the
handle at its start) to the bottom, top, left or right edge; it snaps to the nearest edge when you let go. Left and right show
the bar vertically, and if the window is too short for that, the bar stays at the bottom. **Bar position** in the same section
sets the edge without dragging. With the grip focused, the arrow keys move the bar, and the new edge is announced to screen
readers. Below 768px both styles use the drawer and the menu button, and your chosen style comes back when the window grows. The page
leaves room for the bar on its edge, so content never scrolls under it.

There are no page sidebars; secondary panels are overlays closed with `Esc`. You can also open Settings with `Ctrl`/`⌘+,`.

| Screen | What it does |
| --- | --- |
| **Home** | One line of vault health (notes, broken links, orphans). Broken links and orphans open a list of their rows with actions when there are any: open the note, or create the missing note for a broken link. Then up to three pending proposals, each with one line of its reason. Home does not approve: **Review** opens the proposal, where you approve it, and **Reject** asks you to press it again to confirm. A **Show all in Inbox** link with the count appears when there are more. Then **Continue where you left off** (the last five notes or projects you opened on this device, topped up with recently updated notes), and agent activity: three rows, with **Show all** to expand the full day in place. A **Get set up** line shows the next open step until all three are done (install notes, connect an agent, start a project); dismiss it to hide it. An empty vault shows the starter-pack onboarding. |
| **Explore** | One toolbar row: search, a type select with counts, layer, sort, list or grid, and New note. Filters, keyboard navigation and the new-note dialog work as before. Default columns are title, layers, tags and updated; the updated column appears only when some note has a date. The note ID shows on row hover or focus; Source is a column only when the vault mixes agent, pack and hand-written notes. An empty vault and a search with no matches show different empty states. A search with no matches offers **Create note**, which opens the New note dialog with the query as its title, and **Clear filters** when filters are set. |
| **Projects** | Project notes, filtered by status with counts. Each row shows the name, status and last update, plus one muted line only when something needs attention: failing checks or missing technologies. Search and sort appear from eight projects. The status chip on each row is a menu: Active, Paused, Done or Archived. Done projects sort last and collapse into a `Done (N)` group in the All view. The empty state offers New project. |
| **Editor** | Frontmatter form generated from the note type, Markdown body in edit / preview / split, `[[` wikilink autocomplete, connections (links, backlinks, unresolved) and a local graph. A conflict banner appears if the file changed on disk. |
| **Graph** | Every note and link, with type and layer filters in a floating toolbar, node search, broken links and neighborhood focus. The full free view draws the notes on rings by type: profiles and projects at the centre, then tech, practices, checks, and layers and other notes outermost. A faint circle marks each ring. Notes sit at angles near the inner notes they link to, so clusters stay together, and a type with no notes takes no ring. Group by layer shows one box per layer instead, and the editor's local graph keeps its own layout. On an empty vault the toolbar is hidden and the canvas offers starter notes or Explore. Coming back to Graph shows the picture you left, with the same positions and zoom, without laying it out again. The rings come only from the vault, so the same vault always draws the same picture. Vault changes still update it. On a graph over 300 notes, zoomed-out labels show only the best-connected notes. |
| **Inbox** | Each row shows the type, title, action, author and age. The **All**, **Create** and **Update** tabs filter the list, and when more than one agent has proposals waiting, an agent select beside them narrows it to one agent. The agent stays in the address (`?agent=`), so Back from a proposal returns to the same list. At 1280px and wider, selecting a row opens its detail panel with the reason, a one-line summary of the change, the diff, and Approve, Edit and approve, or Reject. A new note always shows the unified diff; an update can switch between side-by-side and unified. Below 1280px the row opens the proposal page, which has the same actions. Pack proposals are grouped with **Approve all**. Approve all and Reject all act on what the filters show; with an agent chosen, Approve all reads `Approve 3 from claude-code`. Approve, reject and **Approve all** wait 6 seconds before they are written; see [Reviewing proposals](#reviewing-proposals). An empty inbox says why and offers one action: install the starter notes, or connect an agent. |
| **Settings** | Six sections: **General** (language, theme, navigation style and bar position, vault path; in the [desktop app](desktop) also **Open folder** and **Change folder**), **Startup**, **Agents** (connect or disconnect each coding agent and see the file change it makes), **Search** (semantic search on or off), **Updates** and **About**. Each change applies as soon as you pick it; there is no Save button. Startup and Updates are desktop-only; see [Desktop settings](desktop#desktop-settings). |
| **Skills** | Every skill installed for your coding agents, grouped by area. One filter row holds the search and an agent select, with area chips beside it. Expand a row for its path, version and area control; the area control is where you change a skill's area, and **Changed by you** shows when you have. |
| **Recommend** | Project description first; layers are one collapsed line (`All layers, 3 per layer`) that opens the layer chips and per-layer stepper. Once there is a result, the example prompts hide and the intro moves behind `?`. Profiles, then a shortlist with one section per layer: each tech is one card with its title and reasons (**Matches**, **Fits profile**, **Watch out**), and **Also fits** names its other layers. No scores show until you open a card's **Why**. Select techs, then export with the **STACK.md / AGENTS.md / CLAUDE.md / Cursor** tabs of the modal, each with copy or download. Shows whether the mode is **Keywords** or **Hybrid**. While a new ranking runs, the previous one stays on screen, dimmed. On an empty vault it asks you to install the starter packs first. An **Ask an agent** run is kept per browser tab: it keeps going when you leave the page, and the Recommend item in the navigation (sidebar or floating bar) shows its progress. |

Each screen's one-line intro sits under its title until the screen has content, then moves behind the `?` in the header. Settings keeps its intro behind the `?`. Its `×` hides the intro for that screen in this browser, and the `?` still shows it.

Each page names itself in the browser tab, for example `Explore · Basics`. The Inbox adds its pending count, as in `Inbox (3) · Basics`, and a note or proposal shows its own title.

## Going back

A note and a proposal have a **Back** control that names the page you came from. Alt+Left, Alt+Right and the mouse side
buttons also move back and forward through the pages you visited in this session, and each page returns with its scroll
position and Explore's filters restored. A note or proposal opened directly, with no earlier page, goes back to Explore or
Inbox. Home, Explore, Projects, Graph, Inbox, Recommend, Skills and Settings have no back control; you reach them from the
navigation. If a note has unsaved changes, going back asks you first.

## Reviewing proposals

Each proposal shows a one-line summary of what it changes above the diff, such as `New tech note in Backend` or `Adds tag testing · Changes title`. The diff keeps three lines of context around each change and folds the rest into a row such as **⋯ 40 unchanged lines**; click it to show them. Added lines are marked `+` and removed lines `-`, in both views.

In the Inbox and on a proposal page, approve, reject and **Approve all** wait 6 seconds before the change is written. The
toast shows **Saving in 6 s** and **Undo (Z)**. Press `Z` or click **Undo (Z)** to cancel: the proposal comes back and nothing
is written. The selection moves on at once, so you can keep reviewing while a decision waits. Reject on Home is sent at once
after its second press, with no undo.

Closing the browser tab, or reloading it, before the 6 seconds end cancels the decision too, and nothing is written. In the
[desktop app](desktop), closing the window only hides it, so the decision still goes through; **Quit Basics** cancels it.

If an edit fails, your draft is kept. A field error reopens the editor with the errors shown on the fields. Other errors
show a toast with **Open**, which brings the editor back with your draft.

## Shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl`/`⌘+K` | Command palette: search notes and proposals, jump to any screen, run actions (including copying the MCP command). With proposals waiting, its first entry is **Review next proposal**, which opens the Inbox. A query with no match offers **Create note**, which opens the New note dialog with the query as its title |
| `Ctrl`/`⌘+,` | Open Settings |
| `Alt`+`←` / `Alt`+`→`, mouse buttons 3 and 4 | Back / forward through the pages you visited, with scroll and filters restored |
| `Ctrl`/`⌘+B` | Show or hide the sidebar's labels (full sidebar or icon rail); no effect in Floating style |
| `g` then `h` / `e` / `p` / `g` / `i` / `r` / `k` | Go to Home / Explore / Projects / Graph / Inbox / Recommend / Skills |
| `Ctrl`/`⌘+S` | Save the note in the editor |
| `Ctrl`/`⌘+F` | Focus search in Explore and in the graph. In the [desktop app](desktop) it opens the command palette search instead |
| `↑` / `↓`, `Enter` | Move through lists (Explore, Inbox, palette) and open. In the Inbox the selected row takes focus on load, and the arrows move the selection and its focus together |
| `Tab` (first stop on each page) | **Skip to content**: moves focus past the navigation into the page |
| `Esc` in the Explore search | Clears the search; a second `Esc` moves focus to the note list |
| `Esc` in the Graph search | Clears the search; a second `Esc` moves focus to the graph canvas, which is one Tab stop |
| `a` | Approve the selected proposal, in the Inbox or in a proposal. The write waits 6 seconds |
| `r`, then `r` again | Reject the selected proposal, in the Inbox or in a proposal. The second press confirms |
| `e` | Edit and approve the open proposal |
| `z` | Undo the last approve, reject or bulk action that is still waiting to save |
| `Ctrl`/`⌘+Enter` | Run the recommendation |

## Live updates and preferences

The server watches the vault and pushes changes over SSE, so Home, Explore, Graph and Inbox update as files change. Settings → General
holds the language (EN or ES), the theme (light or dark), the navigation style, the bar position and the vault path. Settings → Search turns semantic search on or off, the same
as `basics embeddings enable` and `basics embeddings disable`.

## Security

`basics ui` listens on `127.0.0.1` only and rejects requests whose `Host` or `Origin` is not localhost. There is no
login because the server is local; do not expose it through a proxy, tunnel or port forward.

While the UI runs, the same port serves MCP over HTTP at `http://127.0.0.1:4747/mcp`; see
[MCP clients](./mcp-clients.md).

## Development

From the repo, run `basics ui --no-open` for the API and `npm run dev:ui` for Vite with a proxy to it. The end-to-end
suite runs with `npm run e2e` and needs `npm run build` first.
