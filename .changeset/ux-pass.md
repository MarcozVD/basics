---
"@marcozvd/basics": patch
---

A UX pass so a first-time user understands every page. Visual identity, routes, behaviour and keyboard shortcuts are unchanged.

- The Dock is labelled and every page opens with a one-line intro; filters and controls carry a term hint explaining what they do.
- Home shows a get-set-up checklist while the vault, an agent or a project are missing, and empty states link to the one action that fills them.
- Recommend explains itself: **Per layer** has a tooltip, the empty state is just the day-one example chips, and **Ask an agent** says how it differs from Recommend.
- Shortcut hints follow the platform: `⌘K` / `⌘F` / `⌘↵` on macOS, `Ctrl+K` / `Ctrl+F` / `Ctrl+Enter` elsewhere, in the Dock, Explore, Graph and Recommend.
- Explore: the Layers column keeps each chip at its natural width and folds the rest into a `+n` (one chip + `+n` when the column is narrow), so a short layer name is never cut.
- Graph: leaving and coming back to `/graph` keeps the canvas painting (the kept cytoscape renderer is no longer detached and destroyed).
- Projects: missing paths are hidden in the list, empty reason and lessons say how to fill them, and the check hint says a coding agent can record the results.
- Skills: **Details** / **Hide details** replace "more"/"less", the **Shared** filter has a hint, and the per-row area select is labelled.
