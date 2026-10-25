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
  top-bar: "60px"
  dock: "54px"
  dock-space: "78px"
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

1. **The agent loop is the hero.** Inbox, proposals and provenance (`source: agent:<name>`) stay one keystroke away; the Dock badge always shows the pending count.
2. **Files are the truth.** Ids, paths and frontmatter keys are shown in Geist Mono, never hidden behind friendly names.
3. **Keyboard first, never blocking.** Every action works without the mouse, ⌘K everywhere, and no animation delays input.
4. **Dense and calm.** A native macOS tool next to the IDE in the evening: dark first, pill controls, gliding indicators, color only where it carries meaning (accent and note types).
5. **Accessible by default.** WCAG 2.2 AA contrast in both themes, a visible focus ring on every control, `prefers-reduced-motion` honored, EN/ES for every string.

## Layout

- **Full width, no centered page column.** Pages fill the viewport and get more columns as it grows; empty side margins are a bug, not a frame. There is no max-width page container and no navigation sidebar.
- **Page frame** (`components/page.tsx`): every routed page wraps its content in `<Page>`, which owns `PAGE_GUTTERS`, `pt-4` and the bottom rhythm. Gutters are **24px below 768px, 32px from 768px, 40px from 1024px and 48px from 1440px** (`PAGE_GUTTERS`, shared with the top bar and with the sticky page headers so every left and right edge on a screen lines up). The shell's `<main>` already keeps `DOCK_SPACE` clear, so `<Page>` only adds its own bottom rhythm. The desktop window is the reference: 1280×820 by default, 900×600 minimum.
- **Vertical rhythm** (`PAGE_SECTIONS`, `flex flex-col gap-8`): the page title block and the sections below it sit **32px** apart — title → first section 32px, section → section 32px — on Home, Explore, Projects, Inbox and Recommend. Sections keep their own internal 8–12px; the rhythm token only spaces the top-level blocks.
- **No sidebars, ever.** No fixed side columns for navigation, filters, properties or connections, and never a side menu that opens another. Content columns inside a page (Home sections, Inbox master–detail, editor note + properties) are part of the content, not navigation.
- **Dock** (`components/layout.tsx`): floating at the bottom center, 54px tall, 16px off the edge (`DOCK_HEIGHT` / `DOCK_OFFSET`). Home, Explore, Projects, Graph, Inbox (count badge), Recommend | ⌘K. Each item has a tooltip with label and `G then <key>`. `<main>` is the scroll container and reserves `DOCK_SPACE` (`DOCK_HEIGHT + 24px` = 78px) as bottom padding and scroll padding, so every page's scrollable content ends at least 78px above the window bottom and the last row clears the Dock when scrolled to the end. Nothing interactive may ever sit under the Dock; fixed-height panels (Home activity, Inbox and Projects lists, full-height empty states) subtract `DOCK_SPACE` from their `100dvh` maths so their own bottom edge stays above it.
- **Top bar**: 60px (`py-4` around a 28px logo), background color, a hairline border only once `<main>` scrolls, the same `PAGE_GUTTERS` as the page so the logo and the page title share one left edge. Left: logo mark, "Basics", vault folder (mono, tooltip with the full path). Right: EN|ES segment and theme toggle. Nothing else.
- **Home** (`/`): the **inbox strip** is always the first block under the title. With no pending proposals it collapses to one line — inbox icon, "Inbox is clear" and the "All proposals" link; with pending proposals it shows the "Waiting for you" label, at most **three** proposal cards and a "See all (N)" link. Below the strip, from 1440px, three columns: Agent activity (~40%), Vault health + Layers (~35%), Recently edited (~25%). From 1024px to 1439px, two columns: activity (~55%, with its own scroll and edge fades) and a right column stacking the health tiles then the layers. On the desktop window the columns fill exactly the space above the Dock (activity is the only thing that scrolls; content that does not fit is kept out of the page scroll, never pushed under the Dock). Below 1024px everything stacks and the page scrolls normally, with the activity list capped at about 8 rows. The first-run onboarding block is left-aligned, with the pack list in an auto-fill grid (320px minimum) instead of a narrow centered column.
- **Recommend** (`/recommend`): full width. The prompt spans the page; layer chips and the per-layer stepper share one row; profiles use an auto-fill grid (300px minimum); per-layer candidate columns auto-fit (280px minimum) so wide screens show four or five layers side by side. The selection bar stays a centered overlay above the Dock.
- **Inbox** (`/inbox`): master–detail from 1280px. The proposal list is a ~420px column that scrolls independently; the selected proposal's detail (reason, diff, actions) fills the rest. Click or ↑/↓ selects, `a`/`r`/`e` act on the selection, and the URL carries `?p=<id>`. Below 1280px the list stays one column and opens the full proposal route (`/inbox/:id`), which always exists. The pack bar stays above the list; detail components live in `components/proposal-detail.tsx` so both routes share the same diff. When there are no pending proposals at all, the split panes are replaced by one empty state centred across the whole content area — never two empty states saying the same thing.
- **Proposal** (`/inbox/:id`): full width, with the reason block and diff using the available space; only the floating action bar is centered.
- **Explore, Graph and the editor**: Explore fills the width (dense table or card grid); Graph is a full-bleed canvas; the editor is full width with the note body and a 380px properties/connections column from 1280px. Empty states center their message but never constrain the page.
- **Readable measure.** Long running prose — note body preview, proposal reasons, Recommend's explanatory sentence — stays left-aligned with the content and caps at roughly 72ch. Cards, tables, diffs and controls are not measure-limited.
- **Filters**: one horizontal row of pills, chips and selects under the page title (Explore, Inbox, Recommend). The graph uses a floating glass toolbar at the top instead. On phones the row wraps and selects stretch to share the width.
- **Secondary panels** are on-demand overlays only (drawer, popover, morph modal, palette), closed with Esc, returning focus to whatever opened them (`lib/return-focus.ts`).
- **Spacing**: 4px grid. Page title block 32px below the top bar and 32px above the first section (`PAGE_SECTIONS`), dense rows 36 to 44px (Explore rows 44px).
- **Breakpoints**: Tailwind defaults plus the custom 1280px and 1440px steps. 640px (`sm`): filter rows stop stretching, the graph toolbar shows dividers and proposal actions show their key hints. 768px (`md`): gutters grow to 32px and the Home activity panel switches to its 8-row cap. 1024px: gutters grow to 40px, Home goes two-column and the activity panel fills its column down to `DOCK_SPACE`. 1280px: Inbox and Projects go master–detail, the editor gets its second column. 1440px: gutters grow to 48px and Home goes three-column. Phones (390px) get the unified diff and a narrower properties label column.

## Colors

Dark is the default when the system is dark; light is fully supported. Tokens are CSS variables in `src/index.css`, exposed to Tailwind through `@theme inline`.

| Role | Dark | Light | Use |
| --- | --- | --- | --- |
| `background` | `#151515` | `#fafafa` | Page |
| `card` (surface) | `#1c1c1e` | `#ffffff` | Cards, inputs, editor |
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
- Depth comes from tone (background → surface → elevated) and 8% hairlines. Shadows only on floating layers: `0 8px 30px rgba(0,0,0,0.25)` (Dock, palette, drawer, modals, selection bar; the graph toolbar uses 0.18 light / 0.35 dark).
- Glass (`backdrop-blur`) only on overlays: palette, drawer, graph toolbar, selection bar, toasts, proposal action bar.
- Focus: a 2px `ring` outline offset 2px on every focusable element (global `:focus-visible` rule in `index.css`); components that draw their own ring (inputs, cards, tabs) keep it.

## Motion

Springs and easings live in `src/lib/ease.ts`.

| Use | Token | Notes |
| --- | --- | --- |
| Press feedback | `SPRING_PRESS` | Scale 0.97 on every button |
| Gliding indicators, shared layout | `SPRING_LAYOUT` | Dock pill, tabs, list highlight, card reorder |
| Overlay entrances | `SPRING_PANEL` | Modals, drawer, selection bar |
| Content swaps | `SPRING_SWAP` | Save → check, dirty dot |
| Fades | `EASE_OUT` | 100–180ms |

- Route change: content fades in and rises 8px over 180ms, never blocking input.
- Lists: enter with y 6px + opacity, 20ms stagger, only the first 10 items animate; exits fade in ~100ms.
- Counts roll with `AnimatedNumber`. The score bar fills in 400ms, the longest motion in the app; nothing on a frequent action exceeds 400ms.
- `prefers-reduced-motion`: every animation drops to opacity only or none (`useReducedMotion()`, `motion-safe:` for CSS pulses).

## Components

**Vendored beUI** — `src/components/motion/` and `src/components/agents/`, installed with `npx shadcn@latest add @beui/<name>`. Third-party code: keep the header comment, do not reformat (Biome ignores `components/motion`). Adaptations are recorded in each file's header comment.

- Motion: `dock`, `tabs` (D8: visible focus ring on segment/pill triggers), `button/base`, `action-swap`, `input`, `select`, `multi-select`, `checkbox`, `switch`, `adaptive-stepper` (+ `liquid`; `fill` exposed), `popover`, `popover-morph`, `tooltip` (+ `tooltip-surface`), `drawer`, `center-morph-modal`, `collapsible`, `card`, `breadcrumb`, `alert`, `animated-badge`, `animated-number`, `animated-toast-stack`, `loader`, `text-reveal`, `theme-toggle` (adapted to `lib/theme.tsx` instead of next-themes). Vendored but currently unused: `command-palette` (superseded by our own), `shared-layout-bg`.
- Agents: `approval-card` (adapted to proposal cards), `code-block` (localizable labels, real wrapping), `prompt-input` (⌘/Ctrl+Enter submit, labelled send button, focus ring), `agent-code` (Shiki core with the JavaScript regex engine and only bash/diff/json/markdown/tsx/typescript, loaded on first use). Vendored but unused: `file-diff`, `agent-disclosure`.

**Built for Basics** following the same concept (`motion/react`, `@/lib/ease` springs, reduced-motion fallbacks, pill shapes, `cn()`):

- `components/app/command-palette.tsx` — ⌘K palette: recent notes, notes, proposals, navigation, actions.
- `components/app/new-note-dialog.tsx` — new note morph modal (opens on `basics:new-note`).
- `components/layout.tsx` — top bar, Dock, route transition, toasts.
- `components/diff-view.tsx` — side-by-side / unified proposal diff with collapsed context.
- `components/graph/` — Cytoscape + fcose canvas, graph model, editor local graph.
- `components/note-form/` — frontmatter form per note type, wikilink CodeMirror extensions, markdown preview, hover note preview, type chip and dot.
- `components/state.tsx` — `Loading`, `ErrorState`, `Empty`.

**Remaining shadcn primitives** in `src/components/ui/`: `button` (not-found page and `dialog`), `dialog` (editor unsaved-changes guard), `textarea` (proposal edit). Replace as screens migrate and delete each file once nothing imports it.

## Screen map

| Route | Screen | Notes |
| --- | --- | --- |
| `/` | Home | Waiting proposals (approve/reject inline), agent activity, vault health tiles with detail popovers. Main chunk. |
| `/explore` | Explore | Search (⌘F), type pills, layer and sort selects, list or grid, arrow keys + Enter. |
| `/notes/:id` | Editor | Breadcrumb bar (Save, more menu), title, type chip and provenance, properties form, edit/preview/split body, connections, local graph. ⌘S saves; conflicts show a banner. |
| `/graph` | Graph | Full-bleed canvas, floating glass toolbar (types, layer, search, broken links, fit), node drawer. |
| `/inbox` | Inbox | Proposal cards, create/update filter; ↑/↓, Enter, A, R. |
| `/inbox/:id` | Proposal | Reason, diff, floating action bar (R / E / A), edit-and-approve modal. |
| `/recommend` | Recommend | Prompt (⌘Enter), layer chips, per-layer stepper, profiles and per-layer candidates with reasons, selection bar → STACK.md modal. |
| overlays | ⌘K palette, New note dialog | Available on every route. |

Every route except Home is lazy-loaded (`App.tsx`, `React.lazy` + a quiet skeleton) and prefetched when the browser is idle; CodeMirror, Cytoscape, Shiki and the markdown stack only load with the routes that use them.

## Do's and don'ts

- Do put filters in one horizontal row and secondary detail in an overlay. Don't add sidebars, pinned panels or nested side menus.
- Do use `primary` for solid fills and `primary-text` / `tintStyle()` for colored text. Don't put raw `--type-*` or `--primary` text on a tint.
- Do lower emphasis with `muted-foreground`. Don't use opacity on text, which breaks contrast.
- Do keep the left type marker for note types only. Don't add colored side borders to cards, alerts or callouts.
- Do keep motion under 400ms with a reduced-motion path. Don't block input with transitions.
- Don't let it drift toward a generic shadcn admin panel, neon or glowing "AI" styling, or low density.
