# Compare with and without Basics

`basics compare` checks one claim: does a coding agent build a project better with Basics than without it? It runs the same
task twice with the agent you choose, once plain and once with Basics connected, then reports what each run produced. The
answer is about your agent, your model and that task. One comparison does not settle it for every project.

```bash
basics --vault ~/basics-vault compare --sample rust-api/login-api --agent claude --yes
basics --vault ~/basics-vault compare "JSON API with login and tests" --agent codex --runs 3
```

The full flag list is in the [CLI reference](../reference/cli.md). Before you quote a result, read [Limits](#limits).

## What each run does

Each run has two conditions. They run one after the other, each in a new empty folder under your temp directory.

| Condition | Project folder starts with | What the agent can use |
| --- | --- | --- |
| `without_basics` | An empty folder | Its own tools and the task |
| `with_basics` | `STACK.md`, `AGENTS.md`, `CLAUDE.md` and `.cursor/rules/stack.mdc` for the recommended stack | The same, plus the Basics MCP server in read-only mode |

Both conditions get the same task text, the same model and the same fixed instruction line. That line asks the agent to
implement working files in the project folder, use the project instructions and tools, leave files outside the project and
its agent settings alone, run the relevant checks and finish with a short summary.

The recommended stack is Basics' keyword ranking for the task. It is the ranking `basics recommend` gives with embeddings
off: the top tech of each layer whose match comes from keywords, text or synonyms. With `--sample`, the layers come from the
sample task.

## Start a comparison

Pass `--yes` to approve the plan in a script:

```bash
basics --vault ~/basics-vault compare --sample rust-api/login-api --agent claude --yes
```

Without `--yes`, compare first prints the plan to stderr:

```
Planned: 2 agent runs (1 without Basics, 1 with Basics). Timeout: 600s per condition. Output checks will run in those directories.
```

In a terminal it then asks whether to start the runs and run the vault checks on their output. Answer no and nothing starts.
Without a terminal, compare stops with `compare requires --yes without an interactive terminal` unless you pass `--yes`.

### Why it asks

Each run is a full agent session. It calls the model, uses your agent's quota, plan allowance or API credits, and a run
usually takes minutes. The default is two sessions, one per condition. `--runs N` makes 2N sessions. The plan shows that
count before anything starts, which is why the confirmation exists.

Ctrl+C during an agent run stops that run, records it as failed and still saves the report.

## Flags

| Flag | Meaning | Default |
| --- | --- | --- |
| `--agent <agent>` | `claude` (Claude Code), `opencode` or `codex`. Required. | none |
| `--model <model>` | Model passed to the agent. Both conditions use it. | the agent's default |
| `--runs <count>` | Repeats of the pair. Each repeat runs both conditions. | `1` |
| `--timeout <seconds>` | Limit per condition, for the agent run and its checks together. | `600` |
| `--sample <pack>/<task-id>` | Official sample task, such as `rust-api/login-api`, `mobile/offline-notes` or `data-ml/csv-report`. Cannot be combined with a typed task. | none |
| `--yes` | Approve the planned runs and the output checks without asking. | off |
| `--keep` | Keep the project folders for inspection. Temporary credentials are removed either way. | off |
| `--json` | Print the full report as JSON on stdout. The plan and the confirmation go to stderr. | off |

A typed task is the positional argument, so quote it. Sample prompts use your Basics language, set with
`basics config set language en` or `basics config set language es`.

The exit code is `0` when every run completed. It is `1` when a run failed, timed out or left a cleanup error.

## How each agent runs

Each agent runs headless, started inside its run's project folder, in the mode that lets it write files and run commands
without stopping to ask:

- **Claude Code**: `--dangerously-skip-permissions`, with only the compare MCP configuration (`--strict-mcp-config`) and
  project settings (`--setting-sources project`).
- **OpenCode**: its `build` agent, with all permissions set to allow.
- **Codex**: `--full-auto` with the approval policy set to `never`.

Basics adds no sandbox of its own. The temp folder is where the agent starts. It does not limit what the agent can reach.
The agent runs with your user rights, so it can read and change anything your account can, and it can run commands. Each
agent's own sandbox still applies where it has one. The instruction to stay inside the project is a request, not an
enforced boundary. Run compare on a machine and account you trust.

Every run also gets its own HOME, config and cache folders, so your global agent settings, MCP servers and skills are not
loaded. Local embeddings are off in both conditions. Environment variables such as API keys are passed through as usual.

Only the login file of the chosen agent is copied into the run:

| Agent | File copied |
| --- | --- |
| Claude Code | `.credentials.json` |
| Codex | `auth.json` |
| OpenCode | `opencode/auth.json` |

The copy is written with restricted permissions, where the operating system supports them. It is removed when its run ends,
whether the run succeeded, failed or timed out. `--keep` does not keep it. A hard kill (force quit, power loss) can skip that
cleanup. If that happens, delete the leftover `basics-agent-*` folders in your temp directory.

## Read-only Basics MCP

In the `with_basics` condition the Basics MCP server starts with `--read-only`. In that mode the server:

- offers the read tools, such as search, note reads, stack context, recommendations, export and stack detection;
- does not offer the two tools that write: `propose_note` and `record_project_outcome`;
- writes no activity log, and recommendations use the keyword ranking without syncing the embedding index.

The agent can read your vault but cannot change it. A compare run writes only its result file to your vault. The read-only
rule covers the Basics server only, not the agent's own tools.

## Results

Each comparison writes one JSON file:

```
<vault>/.basics/compare/<timestamp>-<id>.json
```

The `.basics/` folder is git-ignored, either by its `*` rule or by a `/compare/` line that compare adds. The file has
`schema_version` 1. It records the task, the sample, the agent, the model, the runs, the timeout, the recommended stack and
the recommendation mode. It also holds one entry per run, with its metrics, checks and file lists, the agent's final text
(its last 100,000 characters) and, with `--keep`, the path of the kept folder. Finally it has a summary per condition.
Share the file with its settings, because agent, model, runs and timeout are part of the result.

Plain output prints a block per run with its stack lines, checks and file counts, then one summary line per condition.
`--json` prints the same report as one JSON document.

## Metrics

Each run records these five measures. The limits matter as much as the values.

| Measure | What it records | Limits |
| --- | --- | --- |
| Stack match | The share of recommended layers whose recommended tech appears in the project's manifests, detected the way `basics detect` does it. A number from 0 to 1, or `null` when nothing was recommended. | It measures agreement with Basics' recommendation, not code quality. A project without manifests scores 0 even when its code works. The `with_basics` condition is measured against the stack it was given, so it is expected to agree more. |
| Checks | The vault's check commands for the recommended techs, run in the generated project after a successful agent run. Project-local tools (`.venv`, `venv`, `node_modules/.bin`) come first on the PATH. Each check is `pass`, `fail`, `timeout`, `missing_tool` or `skip`. | `pass` means the command exited with code 0. It says nothing about design, and it ignores what the agent claimed about its tests. `missing_tool` means the command was not found, so it counts neither as a pass nor as a fail. `skip` means the agent failed, the check has no command, or the time budget ran out. |
| Wall time | Milliseconds the agent process ran. Checks, setup and cleanup are not included. | Depends on model speed, network load and the machine. |
| Tokens | Input and output tokens as the CLI reports them, and their sum. `unavailable` when the CLI reports none. | Claude Code's counts leave out cache reads and writes, and each CLI counts in its own way. Do not compare totals across agents, and do not treat them as a bill. |
| Files | Files added, changed and deleted, from a snapshot taken after setup. Files Basics exported at the start are not counted as added. Dependency, virtualenv, cache, build and coverage folders are left out. Their paths are listed under `excluded` in the JSON. | A count, not a quality measure. A snapshot stops after 10,000 files, and files over 10 MiB are skipped. The JSON marks such a snapshot as truncated. |

### Repeated runs

With `--runs N`, each condition's summary gives the number of completed runs and, for each measure, the mean, the spread
(population standard deviation), the minimum and the maximum. A single run has no spread. If the ranges of the two
conditions overlap, the difference may be noise.

## Limits

Read these before you quote any number.

- **One run proves nothing.** Agents answer differently each time, so one pair can come out either way. Repeat the runs,
  and report the agent, model, date, runs and timeout next to any figure.
- **Stack match is agreement, not quality.** Basics recommends a stack and then measures whether the agent used it, so the
  `with_basics` condition tends to agree more. A match means the agent followed the recommendation. It does not show that
  the recommendation was right.
- **Checks show what the vault defines.** A passing suite can still hide a poor design. A missing tool shows up as
  `missing_tool`, not as a failure of the agent.
- **The conditions differ in two ways at once.** `with_basics` gets the instruction files and the MCP tools together.
  Compare cannot tell which one caused a difference.
- **Results change with the model, the agent version, your account and the day.** They cannot be reproduced on demand.
- **Compare is a personal test, not a benchmark.** Use it to learn how Basics behaves with your agent and your tasks.

## Safety and trust

- Runs use each agent's automatic mode inside a temp folder. See [How each agent runs](#how-each-agent-runs). The folder is
  a starting point, not a sandbox.
- Check commands come from your vault's check notes, including notes from packs you installed. With `--yes`, compare runs
  them in each generated project. It does not use the trust list that `basics check` asks you to build, and it writes no
  trust entries. Read the check notes of a pack before you compare with it.
- Compare writes to your vault only its result file under `.basics/compare/`.

## Troubleshooting

| Message or symptom | What to do |
| --- | --- |
| `<agent> is not installed (not on PATH)` | Install that agent CLI, or make sure its command runs in your terminal. |
| `compare requires --yes without an interactive terminal` | Pass `--yes`, or run compare in a terminal and confirm the plan. |
| `compare cancelled; no agent runs started` | You declined the plan. Nothing ran. |
| `provide a task or --sample <pack>/<task-id>` | Type a quoted task, or pass a sample id. |
| `--sample must be <pack>/<task-id>` or `sample not found` | Use an id from an official pack, such as `rust-api/login-api`. |
| `the agent timed out after N seconds` | Raise `--timeout`. It is in seconds. |
| Checks show `missing_tool` | The generated project does not have that tool on its PATH. It is recorded as a result, not as a failure. |
| Every run fails at once | Run the agent CLI yourself, outside Basics, to confirm it starts and is logged in. |
| Exit code 1 | At least one run failed, timed out or left a cleanup error. Read the `error` lines in the output or the JSON. |
