---
"@marcozvd/basics": minor
"@marcozvd/basics-core": minor
---

Projects can be marked done, and two UI fixes:

- Projects: a `done` status next to active, paused and archived. The status chip is a menu on each row; done projects sort last and collapse into a remembered `Done (N)` group in the All view. `get_vault_overview` and `record_project_outcome` accept done projects; archived ones are still left out of the overview.
- Spanish: the `paused` status label is now "En pausa" (was "Pausado") everywhere it is shown.
- Fix: Explore kept the "All" filter for a moment when opening a note from a filtered list (Checks, layers). The exiting page now keeps its own URL and filters while it fades.
- Fix: the Recommend "Ask an agent" run survives leaving the page and a reload. The Dock shows a running dot, a toast offers to open Recommend when the run finishes elsewhere, and an interrupted run offers Retry.
