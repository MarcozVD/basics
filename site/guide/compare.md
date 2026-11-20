# Compare with and without Basics

`basics compare` checks one claim: does a coding agent build a project better with Basics than without it? It runs the
same task with the agent you choose under one to three conditions, then reports what each run produced. The answer is
about your agent, your model and that task. One comparison does not settle it for every project.

```bash
basics --vault ~/basics-vault compare --sample rust-api/login-api --agent claude --yes
basics --vault ~/basics-vault compare "JSON API with login and tests" --agent codex --runs 3
basics --vault ~/basics-vault compare --sample rust-api/login-api --agent claude --conditions none,basics --yes
```

The full flag list is in the [CLI reference](../reference/cli.md). The web UI runs the same comparisons on its
[Compare page](./web-ui.md#compare), with the same confirmations and check approval. Before you quote a result, read
[Limits](#limits).

## What each run does

Each repeat runs the selected conditions one after the other. Each run starts in a new empty folder under your temp
directory. All three conditions are selected by default.

| Condition | Project folder starts with | What the agent can use |
| --- | --- | --- |
| `none` (No notes) | An empty folder | Its own tools and the task |
| `agents-md` (Exported notes) | `STACK.md`, `AGENTS.md`, `CLAUDE.md` and `.cursor/rules/stack.mdc` for the recommended stack, the same files `basics` exports | The same files, with no MCP server configured |
| `basics` (Basics MCP + notes) | The same files as `agents-md` | The same files, plus the Basics MCP server in read-only mode |

The `agents-md` and `basics` conditions get byte-identical files, so comparing them isolates the MCP server. Comparing
`none` with `agents-md` isolates the instruction files.

All conditions get the same task text, the same model and the same fixed instruction line. That line asks the agent to
implement working files in the project folder, use the project instructions and tools, leave files outside the project and
its agent settings alone, run the relevant checks and finish with a short summary.

The recommended stack is Basics' keyword ranking for the task. It is the ranking `basics recommend` gives with embeddings
off: the top tech of each layer whose match comes from keywords, text or synonyms. With `--sample`, the layers come from the
sample task.

## Choose the conditions

Pass `--conditions` with an ordered list of `none`, `agents-md` and `basics`, separated by commas. Each condition may appear
once. The runs follow the order you give. An empty list, a repeated condition or an unknown name stops the command before any
agent starts.

```bash
basics --vault ~/basics-vault compare --sample rust-api/login-api --agent claude --conditions none,basics --yes
```

The plan, the run count and the results all follow the list you pass.

## Start a comparison

Pass `--yes` to approve the agent runs in a script:

```bash
basics --vault ~/basics-vault compare --sample rust-api/login-api --agent claude --yes
```

Without `--yes`, compare first prints the plan to stderr. The plan also lists every vault check command the run would
execute, and the acceptance command when you set one. Each one is marked untrusted until you approve it:

```
Planned: 3 agent runs (none, agents-md, basics; 1 per condition). Timeout: 600s per condition. --yes approves agent runs only. --trust-checks approves listed checks in these fresh run directories for this invocation only; no vault trust is saved.
Check <id>: untrusted (will not run without separate approval): <command>
```

In a terminal it then asks whether to start the agent runs. Answer no and nothing starts. Checks get a second question,
covered in [Safety and trust](#safety-and-trust). Without a terminal, compare stops with
`compare requires --yes without an interactive terminal` unless you pass `--yes`.

### Why it asks

Each run is a full agent session. It calls the model, uses your agent's quota, plan allowance or API credits, and a run
usually takes minutes. The default is three sessions per repeat, one per condition. `--runs N` makes 3N sessions, or N times
the number of conditions you choose. The plan shows that count before anything starts, which is why the first question
exists. Check commands and the acceptance command need their own approval, because they are shell commands. See
[Safety and trust](#safety-and-trust).

Ctrl+C during an agent run stops that run, records it as failed and still saves the report.

## Flags

| Flag | Meaning | Default |
| --- | --- | --- |
| `--agent <agent>` | `claude` (Claude Code), `opencode` or `codex`. Required. | none |
| `--model <model>` | Model passed to the agent. Every condition uses it. | the agent's default |
| `--runs <count>` | Repeats of the selected conditions. Each repeat runs every selected condition once. | `1` |
| `--conditions <list>` | Ordered, unique subset of `none`, `agents-md` and `basics`. See [Choose the conditions](#choose-the-conditions). | `none,agents-md,basics` |
| `--timeout <seconds>` | Limit per condition, for the agent run, its checks and the acceptance command together. | `600` |
| `--sample <pack>/<task-id>` | Official sample task, such as `rust-api/login-api`, `mobile/offline-notes` or `data-ml/csv-report`. Cannot be combined with a typed task. | none |
| `--yes` | Approve the planned agent runs without asking. It never approves check commands or the acceptance command. | off |
| `--trust-checks` | Approve the listed vault check commands and the acceptance command for this invocation only. The approval covers this run's fresh project folders and is not saved to the vault. | off |
| `--acceptance-bundle <file>` | JSON bundle of hidden acceptance tests. Extracted only after the agent has exited and its process tree is confirmed stopped. Give it together with `--acceptance-command`. See [Acceptance tests](#acceptance-tests). | off |
| `--acceptance-command <command>` | The command that runs the acceptance tests. It needs the same approval as the checks. | off |
| `--study-dir <dir>` | A study folder that compare watches for contamination. See [Contamination](#contamination). | off |
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

Basics adds no sandbox of its own, in any condition. The temp folder is where the agent starts. It does not limit what the
agent can reach. The agent runs with your user rights, so it can read and change anything your account can, including the
study and acceptance folders, and it can run commands. Each agent's own sandbox still applies where it has one. The
instruction to stay inside the project is a request, not an enforced boundary. Run compare on a machine and account you
trust.

Every run also gets its own HOME, config and cache folders, so your global agent settings, MCP servers and skills are not
loaded. Local embeddings are off in every condition. Environment variables such as API keys are passed through as usual,
except variables that point at protected study or acceptance locations, which are removed.

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

In the `basics` condition the Basics MCP server starts with `--read-only`. In that mode the server:

- offers the read tools, such as search, note reads, stack context, recommendations, export and stack detection;
- does not offer the two tools that write: `propose_note` and `record_project_outcome`;
- writes no activity log, and recommendations use the keyword ranking without syncing the embedding index.

The agent can read your vault but cannot change it. A compare run writes only its result file to your vault. The read-only
rule covers the Basics server only, not the agent's own tools. The `none` and `agents-md` conditions start no Basics server.

## Results

Each comparison writes one JSON file:

```
<vault>/.basics/compare/<timestamp>-<id>.json
```

The `.basics/` folder is git-ignored, either by its `*` rule or by a `/compare/` line that compare adds. The file has
`schema_version` 1. It records the task, the sample, the agent, the model, the runs, the timeout, the conditions, whether
check commands were approved (`trust_checks`), the recommended stack, the recommendation mode and a `validity_note` that
repeats the main limits. It also holds one entry per run, with its metrics, token counts, checks, file lists, Basics MCP
calls (`mcp_tool_calls`), acceptance result (`acceptance`, with `pass_rate` and `all_passed`), contamination flag (`contaminated` and
`contamination_reasons`), shutdown status (`shutdown_confirmed`), the agent's final text (its last 100,000 characters) and,
with `--keep`, the path of the kept folder. Finally it has a summary per condition, with the number of runs that were not
contaminated and `contaminated_runs` for the ones left out. Share the file with its settings, because agent, model, runs,
timeout and conditions are part of the result.

Results saved by earlier versions name the conditions `without_basics` and `with_basics`. The web UI reads them as
`none` and `basics`, and their Basics MCP calls and acceptance fields show as not reported.

Plain output prints a block per run with its token count, stack lines, checks, file counts and, when configured, the
acceptance result, then one summary line per condition, with the acceptance pass rate and fully passing share when configured. `--json` prints the same report as one JSON document.

## Metrics

Each run records these measures. The limits matter as much as the values.

| Measure | What it records | Limits |
| --- | --- | --- |
| Stack match | The share of recommended layers whose recommended tech appears in the project's manifests, detected the way `basics detect` does it. A number from 0 to 1, or `null` when nothing was recommended. | It measures agreement with Basics' recommendation, not code quality. A project without manifests scores 0 even when its code works. The `basics` condition is measured against the stack it was given, so it is expected to agree more. |
| Checks | The vault's check commands for the recommended techs, run in the generated project after a successful agent run and only when approved (see [Safety and trust](#safety-and-trust)). Project-local tools (`.venv`, `venv`, `node_modules/.bin`) come first on the PATH. Each check is `pass`, `fail`, `timeout`, `missing_tool`, `skip` or `untrusted`. | `pass` means the command exited with code 0. It says nothing about design, and it ignores what the agent claimed about its tests. `missing_tool` means the command was not found, so it counts neither as a pass nor as a fail. `skip` means the agent failed, the check has no command, or the time budget ran out. `untrusted` means the command was not approved, so it did not run and has no duration. |
| Wall time | Milliseconds the agent process ran. Checks, setup and cleanup are not included. | Depends on model speed, network load and the machine. |
| Tokens | Input and output tokens: the total is input without cache plus output, for every agent. `unavailable` when the CLI reports no usage. | The total leaves out cache reads and writes, so it undercounts the tokens a run processed. It is a count, not a cost, and not a bill. When the CLI reports them, `cache_read` and `cache_creation` are kept next to the total and never added to it. Compare totals only within the same agent and model. |
| Files | Files added, changed and deleted, from a snapshot taken after setup. Files Basics exported at the start are not counted as added, and neither are the acceptance files extracted for the run. Dependency, virtualenv, cache, build and coverage folders are left out. Their paths are listed under `excluded` in the JSON. | A count, not a quality measure. A snapshot stops after 10,000 files, and files over 10 MiB are skipped. The JSON marks such a snapshot as truncated. |
| Basics MCP calls | The Basics MCP tool calls the agent made in the run, in total and by tool, read from the agent's event stream. Failed attempts count, and events that repeat one call count once. `0` means the agent reported tool calls and none reached Basics. `null` means the agent did not report tool calls, its output could not be read reliably, or the run was cancelled or timed out. | Only as complete as the agent's own event stream. Some agent outputs do not report tool calls at all, for example Claude Code output without its tool events or OpenCode text-only output. Read `null` as not reported, never as zero. |
| Acceptance tests | The pass and fail counts from the acceptance command, when you configure one. `pass` means the command exited with code 0 and reported no failed tests. `fail` means it reported failed tests. `error` means the tests did not run, or the output was not the required JSON line, and the reason is recorded. Each run also gets a pass rate, passed divided by passed plus failed, and an all-passed flag that is true only when no test failed. See [Acceptance tests](#acceptance-tests). | The counts are what your command reports. Errors are never counted as passes or failures. The tests stay out of the project until the agent exits, but the agent is not isolated from them (see [Limits](#limits)). |
| Contamination | Whether the agent's events show that it read or ran something in a study or acceptance location from outside the project. A flagged run stays in the result file with its reasons, and it is left out of every summary number. | It sees only what the agent's event stream reports. A clean result is not proof of isolation. See [Contamination](#contamination). |

### Repeated runs

With `--runs N`, each condition's summary gives the number of completed runs that were not contaminated and, for each
measure, the mean, the spread (population standard deviation), the minimum and the maximum. A single run has no spread. If
the ranges of two conditions overlap, the difference may be noise.

## Acceptance tests

Acceptance tests check an agent's work with tests that are not in the project while the agent works. You write them,
package them in a JSON bundle, and give Basics the bundle and the command that runs them. Basics does not judge the tests
itself. It extracts the bundle and runs your command.

**Bundle.** A regular JSON file of at most 10 MiB, with between 1 and 1000 files. Each key is a relative path that uses `/`
and does not contain `..`, an absolute path or a reserved Windows name. Each value is the file's UTF-8 content:

```json
{
  "files": {
    "tests/login.test.mjs": "...the UTF-8 content of the test file..."
  }
}
```

**Where it goes.** The files are extracted into `.basics-acceptance/` inside the project folder, and the command runs in
the project folder. Refer to the files by that path:

```bash
basics --vault ~/basics-vault compare --sample rust-api/login-api --agent claude --yes --trust-checks \
  --acceptance-bundle ~/acceptance/login.json \
  --acceptance-command "node .basics-acceptance/tests/login.test.mjs"
```

**When it is extracted.** Only after the agent has exited, Basics has confirmed that the agent's processes have stopped,
and the command has been approved. A timeout, a cancellation, a failed agent run or an unconfirmed shutdown gives an
`error` result with its reason, and nothing is extracted. The bundle file itself stays where you put it, outside the run
folders. The agent runs as your user and is not isolated from that file (see [Limits](#limits)).

**Reading the output.** The command's standard output must be exactly one JSON line, such as `{"passed": 2, "failed": 0}`,
with whole, non-negative numbers. Logs, extra fields, invalid counts or extra lines make the result `error`, so send logs to
standard error. The exit status must agree with the counts. An exit code of 0 with `failed` at 0 is `pass`. A non-zero exit
with `failed` above 0 is `fail`. Any other combination is an `error`.

**Approval.** The command appears in the plan as check `acceptance`. It needs the same approval as the vault checks: the
second question in a terminal, the approval checkbox in the web UI, or `--trust-checks`. `--yes` never approves it. Without
approval the result is `error`, with the reason `Acceptance command not approved`, and nothing is extracted.

**Time and results.** The command runs before the vault checks, with the time left in that condition's `--timeout`. Each run
records its acceptance result next to its checks, with `pass_rate` (passed divided by passed plus failed) and `all_passed`. The JSON summary's `acceptance_passed` is the unweighted mean of those pass rates, and `acceptance_all_passed` is the share of runs in which every test passed. Both leave out contaminated runs, errors and runs with no tests. The web UI shows the same two figures as **Acceptance pass rate** and **Fully passing runs**.
Files extracted for acceptance are not counted as the agent's output.

## Contamination

Contamination means the agent saw material it was meant to leave alone. Pass `--study-dir` with the folder that holds your
study material. Compare also protects the acceptance bundle and the folder it sits in. Two checks guard those locations:

- **Before the agent starts.** Compare looks for protected paths in the prompt, in the exported files and in the agent's
  configuration. If it finds one, that run fails before the agent starts, with the reason `study or acceptance location would
  be exposed to the agent`. Protected paths are also removed from the agent's environment variables. This prevents accidental
  exposure. It is not a filesystem sandbox.
- **While the agent runs.** Compare reads the agent's events as they arrive. A file read or a shell command that names a
  protected location from outside the project flags the run: `contaminated: true`, with a reason that does not reveal the
  path.

A flagged run stays in the result file for inspection, marked with its reasons. It is left out of every summary number, of
the figures the web UI calculates, and of the count of completed runs. The summary's `contaminated_runs` shows how many were
left out.

Detection sees only what the agent's event stream reports. A read the agent does not report, or a script it starts that
opens the file itself, can go unnoticed. An unflagged run is not proof that the agent never saw the protected material.

## Limits

Read these before you quote any number.

- **One run proves nothing.** Agents answer differently each time, so one pair can come out either way. Repeat the runs,
  and report the agent, model, date, runs and timeout next to any figure.
- **Stack match is agreement, not quality.** Basics recommends a stack and then measures whether the agent used it, so the
  `basics` condition tends to agree more. A match means the agent followed the recommendation. It does not show that the
  recommendation was right.
- **Checks show what the vault defines.** A passing suite can still hide a poor design. A missing tool shows up as
  `missing_tool`, not as a failure of the agent.
- **Each pair isolates one difference.** `none` against `agents-md` measures the instruction files. `agents-md` against
  `basics` measures the read-only MCP server. Comparing `none` with `basics` changes both at once, so it cannot tell which
  one caused a difference.
- **Results change with the model, the agent version, your account and the day.** They cannot be reproduced on demand.
- **There is no enforced isolation.** Compare does not sandbox the agent. It runs as your user, so it can read anything your
  account can read, including the acceptance bundle and the study folder. The exposure checks and contamination detection
  catch accidental and reported access. They do not prevent deliberate or indirect access. Treat a clean result as nothing
  detected, not as proof that the agent never saw the tests. Run compare only on a machine and account you trust.
- **Compare is a personal test, not a benchmark.** Use it to learn how Basics behaves with your agent and your tasks.
- **The landing page shows one recorded run.** It is one Claude Haiku session on a CSV report task, kept as an example. It is
  not evidence of a general improvement.

## Safety and trust

Check commands and the acceptance command are shell commands. Compare never runs them on its own. Each one runs only when
you approve it for that invocation:

- In a terminal, compare asks a second question after the agent prompt. It lists each command, and the default answer is no.
- `--trust-checks` approves the listed commands without asking. Read them in the plan first, then use it in scripts.
- Without a terminal and without `--trust-checks`, checks are marked `untrusted` and skipped, and an acceptance command is
  reported as an `error`. The agent runs still happen when you pass `--yes`.
- `--yes` never approves checks or the acceptance command.

Compare never writes to the vault's trust list, `.basics/trust.json`. It reads that list the same way `basics check` does,
but each run gets a new project folder, so a trust entry saved by `basics check` almost never matches there. Approval covers
one invocation. The next invocation starts untrusted again.

Approved checks still run under the rest of the safety rules. The timeout, the output link check and the missing-tool check
apply as usual.

To run a check yourself, keep the project with `--keep`, then run it against the same vault:

```bash
basics --vault ~/basics-vault check <kept project folder> --only <check-id> --trust
```

If that folder has no `basics.json`, run `basics export --stack <ids>` in it first, with the tech ids from the result's
`recommendation` field.

Compare writes to your vault only its result file under `.basics/compare/`. Runs use each agent's automatic mode inside a
temp folder, as described in [How each agent runs](#how-each-agent-runs). That folder is a starting point, not a sandbox.

## Troubleshooting

| Message or symptom | What to do |
| --- | --- |
| `<agent> is not installed (not on PATH)` | Install that agent CLI, or make sure its command runs in your terminal. |
| `compare requires --yes without an interactive terminal` | Pass `--yes`, or run compare in a terminal and confirm the plan. `--trust-checks` does not replace `--yes` here. |
| `compare cancelled; no agent runs started` | You declined the plan. Nothing ran. |
| `provide a task or --sample <pack>/<task-id>` | Type a quoted task, or pass a sample id. |
| `--sample must be <pack>/<task-id>` or `sample not found` | Use an id from an official pack, such as `rust-api/login-api`. |
| `--conditions must be a nonempty, unique subset of none,agents-md,basics` | List each condition at most once, separated by commas, with no empty entries. |
| `provide --acceptance-bundle and --acceptance-command together` | Pass both flags, or neither. |
| `acceptance bundle must be outside the vault and run directories` | Move the bundle file out of the vault and out of the run folders. |
| `acceptance bundle must be a regular JSON file no larger than 10 MiB` | Use a regular file, not a link, and keep it under 10 MiB. |
| `Acceptance command not approved` | Approve the acceptance command the same way as the checks: answer yes at the second question in a terminal, or pass `--trust-checks`. `--yes` does not approve it. |
| `Agent process-tree shutdown unconfirmed` | Basics could not confirm that the agent's processes had stopped, so it did not extract the bundle. The result is kept. Look for leftover agent processes. |
| `Agent failed, timed out or was cancelled` | The acceptance tests were not run for that run. |
| `Acceptance command must print exactly one JSON line {passed, failed}` | Print only one JSON line to standard output. Send other output to standard error. |
| `study or acceptance location would be exposed to the agent` | A protected path appears in the prompt, the exported files or the agent's configuration. Move the study or the bundle away from those, then rerun. |
| A run shows `contaminated` | The agent's events touched a protected location from outside the project. The run is kept for inspection and left out of the summaries. |
| Basics MCP calls show `null` | The agent did not report tool calls for that run, so Basics cannot count them. This is not zero. |
| Checks show `untrusted` | Expected without approval. Read the commands in the plan, then rerun with `--trust-checks`, or keep the project and run the check yourself as shown in [Safety and trust](#safety-and-trust). |
| Checks show `missing_tool` | The generated project does not have that tool on its PATH. It is recorded as a result, not as a failure. |
| Every run fails at once | Run the agent CLI yourself, outside Basics, to confirm it starts and is logged in. |
| Exit code 1 | At least one run failed, timed out or left a cleanup error. Read the `error` lines in the output or the JSON. |
