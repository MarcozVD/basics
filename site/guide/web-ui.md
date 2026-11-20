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

Navigation is a sidebar on the left by default: Home, Explore, Projects, Graph, Inbox (with the pending count), Recommend, Compare and
Skills, with **Settings** at the bottom. The top of the sidebar holds the vault folder and a search button that opens the command
palette. On windows 1280px and wider the sidebar shows the labels. From 768px to 1279px it is an icon rail, and hovering or
focusing an item shows its name, shortcut and purpose. Below 768px the sidebar is hidden; a menu button in a bar above the page opens it as a drawer, so the button never covers content.
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
| **Home** | One line of vault health (notes, broken links, orphans). Broken links and orphans open a list of their rows with actions when there are any: open the note, or create the missing note for a broken link. Then up to three pending proposals, each with one line of its reason. Home does not approve: **Review** opens the proposal, where you approve it, and **Reject** asks you to press it again to confirm. A **Show all in Inbox** link with the count appears when there are more. Then **Continue where you left off** (the last five notes or projects you opened on this device, topped up with recently updated notes), and agent activity: three rows, with **Show all** to expand the full day in place. **Get set up** is a four-step checklist: **Create or open a vault**, **Install a pack**, **Connect an agent** and **Approve your first proposal**. Each step links to where it is done and ticks from the vault's real state: a pack is installed, an agent is connected, or an agent's proposal is approved (once ticked, the approval step stays ticked on this device). On an empty vault the checklist sits above the starter packs; otherwise it sits at the bottom of Home. **Dismiss setup** hides it for this vault on this device, and it hides itself when all four steps are done. It ends with a link to the glossary. |
| **Explore** | One toolbar row: search, a type select with counts, layer, sort, list or grid, and New note. Filters, keyboard navigation and the new-note dialog work as before. Default columns are title, layers, tags and updated; the updated column appears only when some note has a date. The note ID shows on row hover or focus; Source is a column only when the vault mixes agent, pack and hand-written notes. An empty vault and a search with no matches show different empty states. A search with no matches offers **Create note**, which opens the New note dialog with the query as its title, and **Clear filters** when filters are set. |
| **Projects** | Project notes, filtered by status with counts. Each row shows the name, status and last update, plus one muted line only when something needs attention: failing checks or missing technologies. Search and sort appear from eight projects. The status chip on each row is a menu: Active, Paused, Done or Archived. Done projects sort last and collapse into a `Done (N)` group in the All view. The empty state offers New project. |
| **Editor** | Frontmatter form generated from the note type, Markdown body in edit / preview / split, `[[` wikilink autocomplete, connections (links, backlinks, unresolved) and a local graph. A conflict banner appears if the file changed on disk. |
| **Graph** | Every note and link, with type and layer filters in a floating toolbar, node search, broken links and neighborhood focus. The full free view draws the notes by type, from the centre outward: profiles and projects first, then tech, practices, checks, layers and other notes. Each type fills concentric rows before the next type starts, so large vaults stay compact. A faint circle marks where each type's band ends. Notes sit at angles near the inner notes they link to, so clusters stay together, and a type with no notes takes no space. In the free view, labels that would overlap stay hidden until you hover over, search for or select a note. Group by layer shows one box per layer instead. Each view keeps its own positions and zoom, so switching back to a view you have already opened is fast; only the first visit to each view lays it out. The editor's local graph keeps its own layout. On an empty vault the toolbar is hidden and the canvas offers starter notes or Explore. Coming back to Graph shows the picture you left, with the same positions and zoom, without laying it out again. The layout comes only from the vault, so the same vault always draws the same picture. Vault changes still update it. On a graph over 300 notes, zoomed-out labels show only the best-connected notes. |
| **Inbox** | Each row shows the type, title, action, author and age. The **All**, **Create** and **Update** tabs filter the list, and when more than one agent has proposals waiting, an agent select beside them narrows it to one agent. The agent stays in the address (`?agent=`), so Back from a proposal returns to the same list. At 1280px and wider, selecting a row opens its detail panel with the reason, a one-line summary of the change, the diff, and Approve, Edit and approve, or Reject. A new note always shows the unified diff; an update can switch between side-by-side and unified. Below 1280px the row opens the proposal page, which has the same actions. Pack proposals are grouped with **Approve all**. Approve all and Reject all act on what the filters show; with an agent chosen, Approve all reads `Approve 3 from claude-code`. Approve, reject and **Approve all** wait 6 seconds before they are written; see [Reviewing proposals](#reviewing-proposals). An empty inbox says why and offers one action: install the starter notes, or connect an agent. |
| **Settings** | Six sections: **General** (language, theme, navigation style and bar position, vault path; in the [desktop app](desktop) also **Open folder** and **Change folder**), **Startup**, **Agents** (connect or disconnect each coding agent and see the file change it makes; agents Basics does not find sit under **Other agents**, and **Other agent: manual setup** gives JSON, TOML, HTTP and command snippets to copy), **Search** (semantic search on or off; project history on or off, and its strength), **Updates** and **About**. Each change applies as soon as you pick it; there is no Save button. Startup and Updates are desktop-only; see [Desktop settings](desktop#desktop-settings). |
| **Skills** | Every skill installed for your coding agents, grouped by area. One filter row holds the search and an agent select, with area chips beside it. Expand a row for its path, version and area control; the area control is where you change a skill's area, and **Changed by you** shows when you have. |
| **Recommend** | Project description first; layers are one collapsed line (`All layers, 3 per layer`) that opens the layer chips and per-layer stepper. Once there is a result, the example prompts hide and the intro moves behind `?`. Profiles, then a shortlist with one section per layer: each tech is one card with its title and reasons (**Matches**, **Fits profile**, **Watch out**), and **Also fits** names its other layers. No scores show until you open a card's **Why**. Select techs, then export with the **STACK.md / AGENTS.md / CLAUDE.md / Cursor** tabs of the modal, each with copy or download. Shows whether the mode is **Keywords** or **Hybrid**. While a new ranking runs, the previous one stays on screen, dimmed. On an empty vault it asks you to install the starter packs first. An **Ask an agent** run is kept per browser tab: it keeps going when you leave the page, and the Recommend item in the navigation (sidebar or floating bar) shows its progress. |
| **Compare** | Runs the same task with and without Basics from the browser and shows both results side by side. Starting a run asks you to confirm the agent runs and, separately, to approve any checks. See [Compare](#compare). |

Each screen's one-line intro sits under its title until the screen has content, then moves behind the `?` in the header. Settings keeps its intro behind the `?`. Its `×` hides the intro for that screen in this browser, and the `?` still shows it.

Each page names itself in the browser tab, for example `Explore · Basics`. The Inbox adds its pending count, as in `Inbox (3) · Basics`, and a note or proposal shows its own title.

## Going back

A note and a proposal have a **Back** control that names the page you came from. Alt+Left, Alt+Right and the mouse side
buttons also move back and forward through the pages you visited in this session, and each page returns with its scroll
position and Explore's filters restored. A note or proposal opened directly, with no earlier page, goes back to Explore or
Inbox. Home, Explore, Projects, Graph, Inbox, Recommend, Compare, Skills and Settings have no back control; you reach them from the
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

## Compare

Compare runs the same comparison as [`basics compare`](./compare.md) from the browser. Open it from the sidebar, with `g` then
`c`, or from the command palette. It needs a coding agent installed on this computer: Claude Code, Codex or OpenCode. Without
one, the page says so and cannot start a run.

**Set up a run.** Choose a task: pick a **Pack sample**, a task from an official pack in your language, or choose **Write your
own task** and describe what the agent should build. Pick the agent and, if you want, a model; **Agent default** leaves the model
to the agent. **Runs per condition** accepts 1 to 10, and **Timeout per condition (seconds)** accepts 1 to 3600. **Review run**
prepares the plan on the server. The form stays locked while a comparison is being prepared or runs.

**Confirm the agent runs.** The first dialog says how many agent runs will start. Each one uses your agent account's usual
quota and may incur provider charges. Basics cannot predict the cost, so the dialog shows no amount.

**Approve checks separately.** The second step lists each check ID and its command. The **Approve listed checks for this run**
checkbox is off by default. Without it, the checks stay untrusted and do not run, and the agent runs still go ahead. Approval
covers this comparison only and is never saved as vault trust, the same as `--trust-checks` on the command line.

**Watch and cancel.** Progress moves through Planned, Agent running, Checking output, Condition finished and Finished, and it
updates live. If you leave the page and come back, it shows the comparison that is still running. **Cancel** stops the agent
and any running check. The page then shows "Cancelling and cleaning up..." until the temporary folders are removed. A cancelled
run stays in the history, marked as cancelled.

Only one comparison runs at a time, cancellation and cleanup included. A start is refused when another comparison is running,
when the review is more than five minutes old, or when the check commands changed. The page then shows "Comparison unavailable";
review the run again.

**Read the result.** The **At a glance** table sits above the detailed cards and compares Without Basics with With Basics on:

- stack agreement, as "N of M layers";
- checks passed, as "N of M approved", with unapproved commands counted separately;
- wall time, in seconds;
- tokens (input + output, excluding cache).

With repeated runs, each figure also shows the mean and the standard deviation (SD). A figure the CLI did not report reads
"Not reported", never zero.

Below the table, the two cards sit side by side on a wide screen and stack on a narrow one. For each run, a card shows the
recommended and the used technologies per layer, with a match or no-match mark ("Used: none detected" when nothing was found);
every check's status and command; wall time; tokens, with cache read and cache creation on their own rows when reported; added,
changed, deleted and excluded files; and an excerpt of the assistant's output, up to 3000 characters. Check output and file
lists open with keyboard-operable disclosures.

**History.** The list shows up to the 200 latest saved comparisons, with their date, agent and model. Open one to read its cards
again. **Delete result** asks "Delete this result?" and says that only this saved result is deleted, while project files and
vault notes stay intact. Cancel keeps it. Deleting removes only that one JSON file.

**Limits.** The limits in the [CLI guide](./compare.md#limits) apply here too: one run proves nothing, stack agreement is not
quality, and token totals are counts, not a bill.

**The landing page.** The Compare section of the landing page and the Compare page of the demo show one recorded Claude Haiku
run on a CSV report task, with and without Basics. It is a static snapshot. No agent runs in the demo, and it is not evidence of
a general improvement.

## Shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl`/`⌘+K` | Command palette: search notes and proposals, jump to any screen, run actions (including copying the MCP command). With proposals waiting, its first entry is **Review next proposal**, which opens the Inbox. A query with no match offers **Create note**, which opens the New note dialog with the query as its title |
| `Ctrl`/`⌘+,` | Open Settings |
| `Alt`+`←` / `Alt`+`→`, mouse buttons 3 and 4 | Back / forward through the pages you visited, with scroll and filters restored |
| `Ctrl`/`⌘+B` | Show or hide the sidebar's labels (full sidebar or icon rail); no effect in Floating style |
| `g` then `h` / `e` / `p` / `g` / `i` / `r` / `c` / `k` | Go to Home / Explore / Projects / Graph / Inbox / Recommend / Compare / Skills |
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
as `basics embeddings enable` and `basics embeddings disable`. It also turns project history on or off and sets its strength, see [Project history](./recommend.md#project-history).

## Security

`basics ui` listens on `127.0.0.1` only and rejects requests whose `Host` or `Origin` is not localhost. There is no
login because the server is local; do not expose it through a proxy, tunnel or port forward.

While the UI runs, the same port serves MCP over HTTP at `http://127.0.0.1:4747/mcp`; see
[MCP clients](./mcp-clients.md).

## Development

From the repo, run `basics ui --no-open` for the API and `npm run dev:ui` for Vite with a proxy to it. The end-to-end
suite runs with `npm run e2e` and needs `npm run build` first.

The static app demo at `/basics/demo/` is built by `npm run demo:build`, which `npm run docs:build` runs after VitePress. Its output goes to `site/.vitepress/dist/demo`. The API snapshot it uses is recorded during that build and is not committed. The demo browser suite runs with `npm run e2e:demo` after the build.
