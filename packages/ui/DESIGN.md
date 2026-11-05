---
name: Basics UI
description: Local control room for a personal stack memory that coding agents read and extend.
colors:
  background-dark: "#151515"
  surface-dark: "#1c1c1e"
  elevated-dark: "#232326"
  text-dark: "#f2f2f2"
  muted-text-dark: "#9a9aa0"
  border-dark: "rgba(255, 255, 255, 0.08)"
  shell-dark: "#0e0e10"
  shell-light: "#eeeef0"
  background-light: "#fafafa"
  surface-light: "#ffffff"
  elevated-light: "#f4f4f5"
  text-light: "#111113"
  muted-text-light: "#6b6b72"
  border-light: "rgba(0, 0, 0, 0.08)"
  accent-ring-dark: "#0a84ff"
  accent-ring-light: "#007aff"
  accent-solid-dark: "#0a6fdb"
  accent-solid-light: "#0068d6"
  destructive-dark: "#ff375f"
  destructive-light: "#d70f3d"
  type-tech: "#0a84ff"
  type-practice: "#30d158"
  type-check: "#ff9f0a"
  type-profile: "#bf5af2"
  type-project: "#ff375f"
  type-layer: "#8e8e93"
typography:
  page-title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  note-title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.5
  prose:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    lineHeight: 1.65
  card-title:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
  secondary:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
  control:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
  section-label:
    fontFamily: "Geist Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.05em"
  mono-meta:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "11px"
  mono-chip:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "10.5px"
  mono-caption:
    fontFamily: "Geist Mono Variable, ui-monospace, monospace"
    fontSize: "10px"
rounded:
  sm: "6px"
  md: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  unit: "4px"
  page-gutter: "24px"
  page-section: "32px"
  row: "44px"
  sidebar: "224px"
  sidebar-rail: "64px"
  title-strip: "40px"
  shell-inset: "8px"
components:
  button-primary:
    backgroundColor: "{colors.accent-solid-dark}"
    textColor: "#ffffff"
    rounded: "{rounded.full}"
    height: "32px"
  chip-type:
    rounded: "{rounded.full}"
    height: "20px"
  card:
    backgroundColor: "{colors.surface-dark}"
    rounded: "{rounded.2xl}"
  input:
    rounded: "{rounded.xl}"
    height: "32px"
---

# Basics UI — design system

Source of truth for the web UI in `packages/ui`. Product context lives in [PRODUCT.md](PRODUCT.md); the agent-facing working rules are in [docs/agents/design.md](../../docs/agents/design.md). Visual reference: [beUI](https://beui.dev/components/motion) (MIT, © 2026 Saurabh Chauhan).

## Principles

1. **The agent loop is the hero.** Inbox, proposals and provenance (`source: agent:<name>`) stay one keystroke away; the sidebar's Inbox badge always shows the pending count.
2. **Files are the truth.** Ids, paths and frontmatter keys are shown in Geist Mono, never hidden behind friendly names.
3. **Keyboard first, never blocking.** Every action works without the mouse, ⌘K everywhere, and no animation delays input.
4. **Dense and calm.** A native macOS tool next to the IDE in the evening: dark first, pill controls, gliding indicators, color only where it carries meaning (accent and note types).
5. **Accessible by default.** WCAG 2.2 AA contrast in both themes, a visible focus ring on every control, `prefers-reduced-motion` honored, EN/ES for every string.

## Layout

- **Full width, no centered page column.** Pages fill the viewport and get more columns as it grows; empty side margins are a bug, not a frame. There is no max-width page container.
- **Page frame** (`components/page.tsx`): every routed page wraps its content in `<Page>`, which owns `PAGE_GUTTERS`, `pt-4` and the bottom rhythm. Gutters are **24px below 768px, 32px from 768px, 40px from 1024px and 48px from 1440px** (`PAGE_GUTTERS`, shared with the sticky page headers so every left and right edge on a screen lines up). `<main>` is the scroll container inside the content panel, so `<Page>` only adds its own bottom rhythm. The desktop window is the reference: 1280×820 by default, 900×600 minimum.
- **Vertical rhythm** (`PAGE_SECTIONS`, `flex flex-col gap-8`): the page title block and the sections below it sit **32px** apart — title → first section 32px, section → section 32px — on Home, Explore, Projects, Inbox and Recommend. Sections keep their own internal 8–12px; the rhythm token only spaces the top-level blocks.
- **Page intro.** Every routed page opens with one line under the title (`text-sm text-muted-foreground`, `max-w-[68ch]`, 4px below the title), the same type and spacing as Skills and Settings. Graph has no visible title (full-bleed canvas): its title sits in the toolbar, its intro is the title's tooltip and screen-reader text, and the toolbar and canvas insets follow the toolbar's measured height.
- **One navigation sidebar, no page sidebars.** The app shell has one navigation sidebar (below). No fixed side columns for filters, properties or connections, and never a second side menu. Content columns inside a page (Home sections, Inbox master–detail, editor note + properties) are part of the content, not navigation.
- **Shell** (`components/layout.tsx`): the window and the sidebar sit on `--shell`; the content is one panel on `--card` with a hairline border and `rounded-xl` corners, inset **8px** from the top, right and bottom edges (`shell-inset`). The panel fills the window beside the sidebar. `<main>` is its scroll container, and nothing reserves bottom space for a floating dock. The update banner stays top right of the window.
- **Sidebar** (`components/app/sidebar.tsx`): **224px** expanded from 1280px; a **64px** icon rail from 768px to 1279px; below 768px it is hidden and a menu button at the panel's top left opens `SidebarNav` in the vendored drawer (Esc closes, focus returns to the button). Top: logo, "Basics", vault folder (mono, tooltip with the full path), then a search row that opens the palette and shows `modChord("K")`. Middle: Home, Explore, Projects, Graph, Inbox (count badge), Recommend (running dot while an agent streams), Skills. Bottom: Settings. Each item has an icon, its label when expanded, and a `G then <key>` hint. In the rail each item has a tooltip on hover and keyboard focus with the name, shortcut and a one-line purpose; the palette shows the same shortcut and purpose. The active item is a gliding pill (`SPRING_LAYOUT`). The collapse button and `Ctrl`/`⌘+B` switch between expanded and rail; an explicit choice is saved in `localStorage` (`basics:sidebar`) and wins over the width default. The width change animates with `SPRING_LAYOUT` and labels never wrap mid-animation. Shortcut hints are platform-aware through `modChord()` (`lib/desktop.ts`): `⌘` on macOS, `Ctrl+` elsewhere. Captions are `aria-hidden`; the accessible name stays the `aria-label`. `aria-current` marks the active route; `nav.primary` labels the list.
- **Desktop title strip**: inside the desktop app (`isDesktop()`, from `lib/desktop.ts`) a transparent **40px** strip sits above the panel (`data-testid="title-strip"`, `data-tauri-drag-region="deep"`). The window controls (Minimize, Maximize/Restore, Close, `components/app/window-controls.tsx`) sit flush right in it, with a muted hover, a destructive hover on Close and the same focus ring as every control. Dragging and double-click maximize work on the strip and on the top of the sidebar. macOS keeps its native traffic lights over the sidebar top, and the sidebar reserves room for them. A browser renders no strip, so the panel sits 8px from the top there and 48px in the desktop app.
- **Desktop shell keys**: inside the desktop app, `lib/desktop-shell.ts` cancels the browser keys and menus listed in [site/guide/desktop.md](../../site/guide/desktop.md) (reload, print, find, zoom, history, back/forward, context menu outside fields, link and image drag). Ctrl/⌘+F opens the palette in search mode in the app; page code must not add its own handlers for those keys. A browser is unchanged.
- **Home** (`/`): the **inbox strip** is always the first block under the title. With no pending proposals it collapses to one line — inbox icon, "Inbox is clear" and the "All proposals" link; with pending proposals it shows the "Waiting for you" label, at most **three** proposal cards and a "See all (N)" link. Below the strip, from 1440px, three columns: Agent activity (~40%), Vault health + Layers (~35%), Recently edited (~25%). From 1024px to 1439px, two columns: activity (~55%, with its own scroll and edge fades) and a right column stacking the health stats, the layers and Recently edited. **Stats** are one wrapping strip of compact `label number` items (the note-type counts, then Broken links and Orphans, which take the destructive colour only above zero and keep their Open / Create and list popovers). **Layers** are a compact two-column list — colour dot, truncated name with a tooltip, count in tabular mono and a thin proportional bar — about six rows for twelve layers, each row with techs opening the same tech-list popover (`max-h-[18rem]` scroll) it had as a tile. **Recently edited** stays in the third column from 1440px; between 1024px and 1439px it sits last in the right column at most five rows, and is hidden entirely rather than clipped once it no longer fits in the panel. On the desktop window the columns fill exactly the panel's height (activity is the only thing that scrolls; content that does not fit is kept out of the page scroll). Below 1024px everything stacks and the page scrolls normally, with the activity list capped at about 8 rows. The first-run onboarding block is left-aligned, with the pack list in an auto-fill grid (320px minimum) instead of a narrow centered column. While setup is incomplete, a compact **Get set up** checklist sits above the grid: three steps (install notes, connect an agent, start a project), each ticked from real state and linked to one place to act. It is not a modal or a tour; its progress is announced through the section's accessible name, and it removes itself once all three steps are done.
- **Recommend** (`/recommend`): full width. The intro explains the flow once; the empty state shows only the "Try" example chips; **Per layer** has an info tooltip; the Ask an agent panel says how it differs from Recommend (it ranks existing notes locally, the agent reads the whole vault and can propose new ones). The prompt spans the page; layer chips and the per-layer stepper share one row; profiles use an auto-fill grid (300px minimum); per-layer candidate columns auto-fit (280px minimum) so wide screens show four or five layers side by side. The selection bar stays a centered overlay at the bottom of the panel.
- **Inbox** (`/inbox`): master–detail from 1280px. The proposal list is a ~420px column that scrolls independently; the selected proposal's detail (reason, diff, actions) fills the rest. Click or ↑/↓ selects, `a`/`r`/`e` act on the selection, and the URL carries `?p=<id>`. Below 1280px the list stays one column and opens the full proposal route (`/inbox/:id`), which always exists. The pack bar stays above the list; detail components live in `components/proposal-detail.tsx` so both routes share the same diff. When there are no pending proposals at all, the split panes are replaced by one empty state centred across the whole content area — never two empty states saying the same thing. Its copy is "Nothing to review yet", one lead line about what fills the inbox, and a single action: install the starter notes when the vault is empty, otherwise connect an agent.
- **Proposal** (`/inbox/:id`): full width, with the reason block and diff using the available space; only the floating action bar is centered.
- **Explore, Graph and the editor**: Explore fills the width (dense table or card grid); Graph is a full-bleed canvas; the editor is full width with the note body and a 380px properties/connections column from 1280px. Empty states center their message but never constrain the page.
- **Readable measure.** Long running prose — note body preview, proposal reasons, Recommend's explanatory sentence — stays left-aligned with the content and caps at roughly 72ch. Cards, tables, diffs and controls are not measure-limited.
- **Empty states**: each one says why the screen is empty, what fills it, and offers one action. Explore splits an empty vault ("Your vault is empty" → install starter notes or new note) from a search with no matches ("No notes found" → clear filters). Projects puts the New project action in its empty state, not the page header. Recommend on an empty vault asks for the starter packs first. Graph hides its toolbar at 0 nodes and shows a vault-empty variant with an action.
- **Explore layer chips** keep their natural width (`max-w-40` with a truncating name). A column too narrow for two chips shows one chip plus `+n`, whose tooltip lists the hidden layers; it expands back when the column grows.
- **Projects**: the list shows the path/profile line only when there is one. Detail empty states say who fills each field (a coding agent for reason and lessons), and the check hint says a coding agent records the results. The detail title is `text-lg` (18px).
- **Filters**: one horizontal row of pills, chips and selects under the page title (Explore, Inbox, Recommend). The graph uses a floating glass toolbar at the top instead. On phones the row wraps and selects stretch to share the width.
- **Secondary panels** are on-demand overlays only (drawer, popover, morph modal, palette), closed with Esc, returning focus to whatever opened them (`lib/return-focus.ts`).
- **Spacing**: 4px grid. Page title block `pt-4` below the panel's top edge and 32px above the first section (`PAGE_SECTIONS`), dense rows 36 to 44px (Explore rows 44px).
- **Breakpoints**: Tailwind defaults plus the custom 1280px and 1440px steps. 640px (`sm`): filter rows stop stretching, the graph toolbar shows dividers and proposal actions show their key hints. 768px (`md`): gutters grow to 32px and the Home activity panel switches to its 8-row cap, and the sidebar becomes the icon rail. 1024px: gutters grow to 40px, Home goes two-column and the activity panel fills its column down to the panel's bottom edge. 1280px: the sidebar expands with its labels, Inbox and Projects go master–detail, the editor gets its second column. 1440px: gutters grow to 48px and Home goes three-column. Phones (390px) get the unified diff and a narrower properties label column.

## Colors

Dark is the default when the system is dark; light is fully supported. Tokens are CSS variables in `src/index.css`, exposed to Tailwind through `@theme inline`.

| Role | Dark | Light | Use |
| --- | --- | --- | --- |
| `background` | `#151515` | `#fafafa` | Page |
| `shell` | `#0e0e10` | `#eeeef0` | Window and sidebar behind the content panel (sidebar muted text: 6.89:1 dark, 4.56:1 light) |
| `card` (surface) | `#1c1c1e` | `#ffffff` | Cards, inputs, editor, the content panel and sticky page headers |
| `popover` / `muted` (elevated) | `#232326` | `#f4f4f5` | Overlays, hover rows, segments |
| `foreground` | `#f2f2f2` | `#111113` | Text |
| `muted-foreground` | `#9a9aa0` | `#6b6b72` | Secondary text, meta lines (AA on every surface) |
| `border` | white 8% | black 8% | Hairlines |
| `ring` | `#0a84ff` | `#007aff` | Focus rings, selection, the iOS blue itself |
| `primary` (solid) | `#0a6fdb` | `#0068d6` | Filled buttons, active segments, indicators; deepened from the iOS blue so white labels pass AA |
| `primary-text` | ring mixed toward foreground | same | Links, accent text, accent chips |
| `destructive` | `#ff375f` | `#d70f3d` | Missing links, delete, errors |
| `destructive-text` | destructive mixed toward foreground | same | Destructive text on tints |

**Note-type colors** (chips, graph nodes, type dots, the 3px type marker in Explore rows), same hue in both themes with adjusted lightness: tech `#0a84ff`/`#007aff` · practice `#30d158`/`#248a3d` · check `#ff9f0a`/`#c76a00` · profile `#bf5af2`/`#a13bd6` · project `#ff375f`/`#e11d48` · layer `#8e8e93`/`#6b6b72`.

**The tint rule.** A chip is a 12% tint of its color with text in `color-mix(color var(--tint-text-mix), foreground)` (68% light, 85% dark). Use `tintStyle()` / `tintText()` from `src/lib/type-color.ts`; never put raw type color text on its own tint, it fails AA.

**The one-accent rule.** Blue means "primary action, active, focused". Everything else is neutral except note types and destructive states. No gradients, glows or colored blurs.

## Typography

**Geist Variable** for UI, **Geist Mono Variable** for ids, paths, counts, code and key hints (`@fontsource-variable/geist`, `@fontsource-variable/geist-mono`). Base 14px / 1.5; headings tracked -0.02em.

| Role | Spec | Where |
| --- | --- | --- |
| Note title | 28px semibold | Editor title field |
| Page title | 20px semibold, tight | Every page `h1` |
| Card / drawer title | 15–18px semibold, tight | Grid cards, graph drawer, profiles |
| Body | 14px | Default text, list titles |
| Prose | 15px / 1.65 | Markdown preview |
| Secondary | 12–13px | Excerpts, descriptions, control labels |
| Section label | 11px semibold uppercase, wide tracking | Home sections, editor collapsibles, Explore groups |
| Mono meta | 10–11px Geist Mono | Ids, counts, timestamps, `kbd` hints, layer chips |

## Shapes and elevation

- Controls and chips fully rounded (`rounded-full`); inputs `rounded-xl`; cards, panels and overlays `rounded-2xl`; rows and small menus `rounded-lg`/`rounded-xl`.
- Depth comes from tone (shell → panel → elevated) and 8% hairlines. Shadows only on floating layers: `0 8px 30px rgba(0,0,0,0.25)` (palette, drawer, modals, selection bar; the graph toolbar uses 0.18 light / 0.35 dark).
- Glass (`backdrop-blur`) only on overlays: palette, drawer, graph toolbar, selection bar, toasts, proposal action bar.
- Focus: a 2px `ring` outline offset 2px on every focusable element (global `:focus-visible` rule in `index.css`); components that draw their own ring (inputs, cards, tabs) keep it.

## Motion

Springs and easings live in `src/lib/ease.ts`.

| Use | Token | Notes |
| --- | --- | --- |
| Press feedback | `SPRING_PRESS` | Scale 0.97 on every button |
| Gliding indicators, shared layout, sidebar width | `SPRING_LAYOUT` | Sidebar active pill, tabs, list highlight, card reorder |
| Overlay entrances | `SPRING_PANEL` | Modals, drawer, selection bar |
| Content swaps | `SPRING_SWAP` | Save → check, dirty dot |
| Fades | `EASE_OUT` | 100–180ms |
| Page exit | `EASE_IN` | Outgoing page fade, 120ms (`lib/ease.ts`) |

- Route change (`lib/page-transition.ts`, `components/layout.tsx`): the page slides in sidebar order. Direction is `+1` toward a lower sidebar item and `-1` toward a higher one (`/notes/:id` ranks just after Explore, `/inbox/:id` just after Inbox); browser Back/Forward (POP) always reverses. The outgoing page fades out with `EASE_IN` over 120ms and moves 6px opposite to the travel; the incoming page fades in from 0 with `EASE_OUT` over 220ms and moves 12px from the travel side. `<main>` clips horizontal overflow, so travel never adds a scrollbar. Rapid navigation never blocks input.
- **Reveal** (`components/page.tsx`): the top-level blocks of a page (page header, first panels) enter with opacity from 0 and 6px up over 220ms `EASE_OUT`, 30ms apart, capped at the fourth block. Lists and cards that already animate their own rows are not wrapped.
- Reduced motion for both: opacity only, 100ms; no page travel, no Reveal offset and no stagger.
- Lists: enter with y 6px + opacity, 20ms stagger, only the first 10 items animate; exits fade in ~100ms.
- Counts roll with `AnimatedNumber`. The score bar fills in 400ms, the longest motion in the app; nothing on a frequent action exceeds 400ms.
- `prefers-reduced-motion`: every animation drops to opacity only or none (`useReducedMotion()`, `motion-safe:` for CSS pulses).

## Components

**Vendored beUI** — `src/components/motion/` and `src/components/agents/`, installed with `npx shadcn@latest add @beui/<name>`. Third-party code: keep the header comment, do not reformat (Biome ignores `components/motion`). Adaptations are recorded in each file's header comment.

- Motion: `tabs` (D8: visible focus ring on segment/pill triggers), `button/base`, `action-swap`, `input`, `select`, `multi-select`, `checkbox`, `switch`, `adaptive-stepper` (+ `liquid`; `fill` exposed), `popover`, `popover-morph`, `tooltip` (+ `tooltip-surface`), `drawer`, `center-morph-modal`, `collapsible`, `card`, `breadcrumb`, `alert`, `animated-badge`, `animated-number`, `animated-toast-stack`, `loader`, `text-reveal`, `theme-toggle` (adapted to `lib/theme.tsx` instead of next-themes). Vendored but currently unused: `dock` (replaced by the sidebar; file kept untouched), `command-palette` (superseded by our own), `shared-layout-bg`.
- Agents: `approval-card` (adapted to proposal cards), `code-block` (localizable labels, real wrapping), `prompt-input` (⌘/Ctrl+Enter submit, labelled send button, focus ring), `agent-code` (Shiki core with the JavaScript regex engine and only bash/diff/json/markdown/tsx/typescript, loaded on first use). Vendored but unused: `file-diff`, `agent-disclosure`.

**Built for Basics** following the same concept (`motion/react`, `@/lib/ease` springs, reduced-motion fallbacks, pill shapes, `cn()`):

- `components/app/command-palette.tsx` — ⌘K palette: recent notes, notes, proposals, navigation, actions.
- `components/app/new-note-dialog.tsx` — new note morph modal (opens on `basics:new-note`).
- `components/layout.tsx` — app shell (sidebar, content panel, desktop title strip), route transition, toasts, update banner.
- `components/app/sidebar.tsx` — navigation sidebar: expanded, icon rail and drawer; `SidebarNav` is shared with the drawer.
- `components/app/window-controls.tsx` — desktop caption buttons (Minimize, Maximize/Restore, Close); rendered only in the desktop app.
- `lib/desktop.ts` — runtime desktop detection (`isDesktop()`, `isMacos()`) and window helpers; loads `@tauri-apps/api` lazily, so a browser never downloads it.
- `components/diff-view.tsx` — side-by-side / unified proposal diff with collapsed context.
- `components/graph/` — Cytoscape + fcose canvas, graph model, editor local graph. The flat full graph runs fcose in a module worker (`graph-layout.worker.ts`, client `graph-layout.ts`; falls back to the main thread if the worker fails).
- `components/note-form/` — frontmatter form per note type, wikilink CodeMirror extensions, markdown preview, hover note preview, type chip and dot.
- `components/state.tsx` — `Loading`, `ErrorState`, `Empty`.

**Remaining shadcn primitives** in `src/components/ui/`: `button` (not-found page and `dialog`), `dialog` (editor unsaved-changes guard), `textarea` (proposal edit). Replace as screens migrate and delete each file once nothing imports it.

## Screen map

| Route | Screen | Notes |
| --- | --- | --- |
| `/` | Home | Get set up checklist above the grid until all three steps are done, waiting proposals (approve/reject inline), agent activity, a compact vault-health stats strip and layer list, both with detail popovers. Orphans and Broken links carry a hint on hover and focus; a zero-value stat without a popover is keyboard-focusable for that hint. Main chunk. |
| `/explore` | Explore | Search (⌘F), type pills (each with a hover and focus hint), layer and sort selects, list or grid, arrow keys + Enter. |
| `/notes/:id` | Editor | Breadcrumb bar (Save, more menu), title, type chip and provenance, properties form, edit/preview/split body, connections, local graph. ⌘S saves; conflicts show a banner. |
| `/graph` | Graph | Full-bleed canvas with a floating glass toolbar that carries the title and intro tooltip (types with hover and focus hints, layer, search, broken links, fit), node drawer. The toolbar is hidden at 0 nodes; the empty canvas says why and offers one action. The canvas instance is kept across route changes, so returning shows the same picture and camera with no layout run (`components/graph/graph-cache.ts` for positions, `components/graph/graph-canvas.tsx`). Graphs over 300 nodes seed positions at once, settle off-thread, and cull labels below zoom 0.6 except the 80 best-connected nodes. |
| `/inbox` | Inbox | Proposal cards, create/update filter; ↑/↓, Enter, A, R. |
| `/inbox/:id` | Proposal | Reason, diff, floating action bar (R / E / A), edit-and-approve modal. |
| `/settings` | Settings | Six sections in a section list (General, Startup, Agents, Search, Updates, About), `?section=` deep links. Opened from the sidebar's Settings item or `Ctrl`/`⌘+,`. Changes apply on pick; no Save button. |
| `/recommend` | Recommend | Prompt (⌘Enter), layer chips, per-layer stepper, profiles and per-layer candidates with reasons, selection bar → STACK.md modal. |
| `/skills` | Skills | Installed agent skills grouped by area. Two filter rows (agent chips, then area chips with `?area=`), instant search, five rows per area with `Show all N`, a per-row area override with reset. Sidebar item (`G then K`); the All view previews five rows per area. Expanded rows read "Details" / "Hide details"; the Shared filter has a hint. |
| overlays | ⌘K palette, New note dialog | Available on every route. |

Every route except Home is lazy-loaded (`App.tsx`, `React.lazy` + a quiet skeleton) and prefetched when the browser is idle; CodeMirror, Cytoscape, Shiki and the markdown stack only load with the routes that use them.

## Do's and don'ts

- Do put filters in one horizontal row and secondary detail in an overlay. Don't add page sidebars, pinned panels or nested side menus; navigation stays in the one shell sidebar.
- Do use `primary` for solid fills and `primary-text` / `tintStyle()` for colored text. Don't put raw `--type-*` or `--primary` text on a tint.
- Do lower emphasis with `muted-foreground`. Don't use opacity on text, which breaks contrast.
- Do keep the left type marker for note types only. Don't add colored side borders to cards, alerts or callouts.
- Do keep motion under 400ms with a reduced-motion path. Don't block input with transitions.
- Don't let it drift toward a generic shadcn admin panel, neon or glowing "AI" styling, or low density.
