# Compare study harness

Developer notes for the Basics compare study: 20 tasks with hidden acceptance tests, a deterministic study vault, a
resumable batch runner and paired analysis. Nothing here starts a real agent by itself. A real study also needs an
external Basics runtime, pinned agent CLIs and an explicitly approved budget.

## Layout

| Path | Contents |
| --- | --- |
| `tasks/<id>.json` | Public task spec: `id`, `title`, `interface` (`http` or `cli`) and the `prompt` the agent sees. |
| `acceptance/<id>/run.mjs` | Hidden acceptance harness. Node built-ins only. Never copied into the agent's project before the run ends. |
| `references/<id>/main.mjs` | Reference solution. It must pass its harness. |
| `references/<id>/study-run.json` | How the project starts (argv only, no shell). |
| `references/<id>/mutations.json` | At least two targeted mutations. Each must make its harness fail. |
| `spec.mjs` | Task loader, the shared contract prompt and the config schema (`mode`, pinned models, prices, budget). |
| `contract.mjs` | Reader for `study-run.json`. Commands are argv only, and executables must stay inside the project. |
| `harness.mjs` | Case runner for the acceptance harnesses. A case that throws `skip: true` counts neither as pass nor fail. |
| `build-bundles.mjs` | Builds one hashed acceptance bundle per task. Bundles hold the harness and its runtime files, never references or mutations. |
| `build-vault.mjs` | Builds the deterministic study vault from the example vault and the English packs. |
| `run.mjs` | Locks a study, runs its cells one at a time, reserves cost before each cell, and resumes. Also reconciles reservations. |
| `analyze.mjs`, `stats.mjs` | Paired analysis: exact Wilcoxon signed-rank test on task-level means, seeded cluster bootstrap, Holm correction. |
| `validate.mjs` | Checks every hidden harness: each reference must pass and each mutation must fail. |
| `stat-fixtures.json` | Hand-computed fixtures for `stats.mjs`. |

Tests live in `packages/basics/test/compare-study.test.ts` (runs in `npm test`) and
`packages/basics/test/compare-study-validate.test.ts` (full harness validation, opt-in).

## Commands

Run these from the repository root. Output directories must be outside the checkout; the runner refuses otherwise.

Validate the hidden harnesses (about 6 minutes; 20 references pass and 40 mutations fail):

```bash
npm run study:validate
npm run study:validate -- 08 11     # only tasks whose id starts with 08 or 11
```

Build the acceptance bundles and the study vault:

```bash
npm run study:bundles -- /abs/path/study-bundles
npm run study:vault -- /abs/path/study-vault
```

Prepare, run and analyze a study:

```bash
npm run study:run -- --config /abs/path/pilot.json --output /abs/path/pilot-run
npm run study:run -- --output /abs/path/pilot-run --execute --approve-checks
npm run study:analyze -- /abs/path/pilot-run
```

`--execute` and `--approve-checks` must be given together. `--approve-checks` approves the vault checks and the acceptance
command for each cell, the same way `basics compare --trust-checks` does. Run the `--execute` command again with the same
`--output` to resume: completed cells are skipped, and a changed config is refused because the lock hash no longer matches.

Each cell is named `<task>.<agent>.r<repeat>.<condition>`, for example `15-dependency-order.claude.r1.none`. If a crash leaves a reservation unresolved, record what was actually charged:

```bash
npm run study:run -- --output /abs/path/pilot-run --reconcile <cell-id> --charged-usd 0.02
```

`analyze` writes `analysis.json` into the output directory and prints one row per agent and condition.

## Study modes

- `study` (default) is the frozen primary design. It needs both agents, every task and at least two repeats. The full
  design with 20 tasks, 2 agents, 2 repeats and 3 conditions has 240 cells.
- `pilot` is a smaller, non-primary run: one or more agents, a task subset and one to ten repeats. Its lock is marked
  `primary: false`, and its analysis is marked `mode: "pilot"` with no primary hypotheses and no Holm family. The analysis
  prints a PILOT banner.

Example pilot config. Replace every placeholder with the frozen value before a real run. The model must match the
`claude-haiku-` pattern in `spec.mjs`, and OpenCode uses a fixed model ID:

```json
{
  "mode": "pilot",
  "tasks": ["15-dependency-order"],
  "seed": "pilot-1",
  "repeats": 1,
  "timeout_ms": 600000,
  "budget_usd": 1,
  "reservation_usd": 0.05,
  "rates_at": "2026-11-20T00:00:00Z",
  "runtime": "/abs/path/to/installed/basics-package",
  "toolchains": { "node": { "command": "node", "prefix": [] } },
  "agents": {
    "claude": {
      "model": "claude-haiku-pinned-id",
      "cli": { "command": "claude", "prefix": [] },
      "version": "pinned-cli-version",
      "prices": { "input": 0, "output": 0, "cache_read": 0, "cache_creation": 0 },
      "cache": "none"
    }
  }
}
```

`runtime` is the root of an installed `@marcozvd/basics` package, with its `dist/` and packs. Each cell runs compare
through that package, not through this checkout. The unit tests inject the in-repo build instead.

## Rules the design depends on

- Hidden acceptance files are extracted only after the agent process tree is confirmed stopped, and only when checks are
  approved. Bundles must not mention references, mutations or `.basics-acceptance`.
- Cost is reserved before each cell. An unknown cost stops the run until it is reconciled.
- The budget caps scheduled cost. It is not a provider billing limit.
- A reference solution is never shown to an agent. Study prompts must not mention hidden tests or mutations.

## Adding a task

1. Add `tasks/<id>.json`, with an id of two digits, a dash and lowercase words, for example `21-example-task`.
2. Add `acceptance/<id>/run.mjs`. It must print exactly one JSON line with `passed` and `failed` counts.
3. Add `references/<id>/` with `main.mjs`, `study-run.json` and at least two entries in `mutations.json`.
4. Run `npm run study:validate -- <id>` until the reference passes and every mutation fails.
5. Update the expected task list and counts in `packages/basics/test/compare-study.test.ts`.

## Tests

```bash
npm test                                      # unit tests, including one real end-to-end cell with a fake agent
BASICS_STUDY_VALIDATE=1 npx vitest run packages/basics/test/compare-study-validate.test.ts   # full harness validation, about 6 minutes
```
