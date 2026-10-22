# Security

## What Basics never does

- **Writes outside the vault on its own.** MCP tools only create inbox proposals or read notes; `export_project` returns
  content and writes nothing. The `basics export` command writes only `STACK.md`, `AGENTS.md`, `CLAUDE.md` and
  `.cursor/rules/stack.mdc` into the directory you pass, and `--templates` only creates files that do not exist yet.
- **Runs a command without approval.** `basics check` prints the directory and the exact command first and asks
  `y` / `n` / `a`. Untrusted commands are skipped when there is no TTY, unless you pass `--trust` yourself.
- **Uses the network.** The only download is `basics embeddings enable`, which asks for confirmation (`--yes` skips it)
  and fetches the runtime and model into the local cache. There is no telemetry or remote sync.

## The inbox is the write path

Agents call `propose_note` or `record_project_outcome`; both write a proposal file in `inbox/` with `proposed_by`,
`reason` and the proposed note. The vault notes are untouched until you approve the proposal in the UI or with
`basics inbox approve`. Approved notes record where they came from in `source` (`manual`, `agent:<name>`,
`pack:<name>@<version>`).

Review the diff before approving: an agent can propose any content, and approving it is what makes it part of your
stack.

## Reserved `pack:` names

Agent names starting with `pack:` are rejected by the proposal tools, so an agent cannot make a note look like it came
from an official pack. Only the pack installer writes `pack:<name>@<version>` provenance.

## Trust list

`basics check` runs shell commands defined in check notes. Before running one it asks, and `a` records the trust in
`<vault>/.basics/trust.json`, keyed by `sha256(absolute directory + command)`.

- Moving the project or editing the command invalidates the entry, so it asks again.
- To revoke trust, delete the entry from `trust.json` (or the whole file).
- `basics check --list` shows the commands and whether they are trusted without running anything.
- `--trust` in CI trusts everything for that run; use it only on a stack you have reviewed.

## Local server

`basics ui` (and the MCP HTTP endpoint on the same port) listens on `127.0.0.1` only and rejects requests whose `Host`
or `Origin` is not localhost. There is no authentication because it is a local server: do not bind it to a public
interface, put it behind a tunnel or forward the port.

## Local state

`<vault>/.basics/` holds embeddings, the trust list and `activity.jsonl`, a local log of MCP calls (agent, tool, notes
affected, about 1000 lines). `basics init` adds `.basics/` to the vault's `.gitignore`; if the vault already existed,
`basics doctor --fix` creates that ignore file. The log never leaves your machine, but it does record agent activity, so
treat the folder as private.

## Untrusted input

Packs and notes are data. A check note can contain an arbitrary shell command and a tech note can contain any text; an
agent reading the vault may repeat it. Only install packs and approve proposals whose source you trust.
