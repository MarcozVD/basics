---
"@marcozvd/basics": patch
"@marcozvd/basics-core": patch
---

Smaller MCP responses for agents, a slimmer `plan-stack` prompt, and faster search.

MCP contract changes:

- `search_vault` returns `{ "hits": [...], "total": n, "hint"?: "..." }` instead of a bare array. `total` counts the notes that matched before `limit`; `hint` appears only when the list is capped.
- `get_note` no longer returns `hash`, the concurrency token the app editor uses. Agents never needed it.
- `recommend_stack` omits empty `matched_*` and `negated_*` lists, zero parts of `score_breakdown` and a zero `language_boost`. Its `note` is one line; the scoring details moved to the tool description.
- Every MCP JSON response is compact (no indentation).

Other changes:

- The `plan-stack` prompt is about 17% shorter, with the same steps and rules.
- The UI server and the MCP server build the search index once per vault change instead of on every query. On the 860-note test vault a search for a new query went from about 9 ms to 2.5 ms over HTTP; the result ranking is unchanged.
- Core exports `buildSearchIndex` and `searchAll`. `search` keeps its array result.
