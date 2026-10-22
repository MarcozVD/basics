# Projects and checks

## Export stack files

```bash
basics export ../my-app --stack fastapi,postgresql,pytest --targets agents,claude,cursor
basics export ../my-app --detect            # detect the stack and merge it with the saved one
basics export ../my-app --templates         # write missing check file templates
basics export ../my-app --dry-run           # show each file and whether it would change
```

| File | Written as |
| --- | --- |
| `STACK.md` | the whole file: practices and checks of the chosen stack |
| `AGENTS.md`, `CLAUDE.md` | a marked block `<!-- basics:start -->` … `<!-- basics:end -->`; text outside the block is untouched |
| `.cursor/rules/stack.mdc` | the whole file, with `alwaysApply: true` |

The stack and targets are saved in `basics.json` at the project root, so the next run is just `basics export ../my-app`;
flags override what is saved. `init-project` remains as a hidden deprecated alias for `basics export --targets agents`.

Over MCP, `export_project` returns the content of these files as JSON and writes nothing: the agent decides where to put
them.

## basics.json

```json
{
  "stack": ["fastapi", "postgresql", "pytest"],
  "targets": ["agents", "claude"],
  "project": "my-app",
  "versions": { "fastapi": "0.115.0", "postgresql": "16.4" }
}
```

| Field | Meaning |
| --- | --- |
| `stack` | tech ids exported for the project |
| `targets` | which agent files to write: `agents`, `claude`, `cursor` |
| `project` | id of the linked project note |
| `versions` | detected or overridden version per tech id |

The full schema is in the [schema reference](../reference/schema.md).

## Detect the stack

```bash
basics detect                       # current directory
basics detect ../my-app --json      # full result as JSON
```

`detect` reads, without recursion, `package.json` (dependencies and devDependencies), `pyproject.toml` (`[project]`,
`[project.optional-dependencies]`, `[tool.poetry.*]`) and `requirements*.txt` (`requirements.txt`,
`requirements-dev.txt`). Package names are mapped to tech notes through the `packages` field of each tech note; Python
names follow PEP 503. Packages that match no note are listed separately as unknown packages. The version is the minimum
of the declared range and stays empty when it cannot be parsed.

`basics export --detect` uses the same rules, merges detected ids with the saved stack and persists the versions. With
versions in `basics.json`, the export filters practices and checks by `since` (inclusive) and `until` (exclusive); when a
version is unknown, they are kept. The MCP tool `detect_stack` is read-only.

## Check templates

A check can ship file templates: a fenced code block with `file=<path>` in the body of the check note.

````markdown
```python file=tests/test_health.py
def test_health():
    assert True
```
````

`basics export --templates` writes those files into the project but only the ones that do not exist: it never overwrites.
The MCP tool `get_check_templates` returns the templates of a stack as JSON.

## Run the checks

```bash
basics check                       # current directory, reads basics.json
basics check ../my-app --list      # checks, commands and trust state, without running
basics check ../my-app --only pytest,ruff
basics check ../my-app --trust     # trust and run everything (CI)
basics check ../my-app --strict --verbose --timeout 120
```

`basics check [dir]` runs the `command` of every check of the saved stack in the project directory. Without a
`basics.json` it warns and exits with code 1: export first.

| Flag | Effect |
| --- | --- |
| `--list` | list checks, commands and whether they are trusted, without running |
| `--only <ids>` | run only these checks (comma separated) |
| `--trust` | trust and run without asking (for CI) |
| `--timeout <s>` | per-check timeout, 600 s by default |
| `--verbose` | stream the command output live |
| `--strict` | also fail when a check was skipped or untrusted |

Exit codes: `0` when everything passed; `1` when a check failed, the confirmation was cancelled, or `--strict` found
skipped or untrusted checks. Without a TTY and without `--trust`, untrusted commands are not executed.

Results are stored in `last_checks` on the project note (status, date, duration and output tail) and shown as status
chips in the UI.

## Trust model

- Every command is shown with the project directory before it runs; `y` runs it once, `n` skips it, `a` runs it and
  saves the trust.
- The trust list is `<vault>/.basics/trust.json`, indexed by `sha256(absolute directory + command)`. Moving the project or
  changing the command asks again.
- Commands come from your vault notes (yours or an installed pack), never from the project being checked. Review them
  with `basics check --list` before trusting a new pack.
- `--trust` is for CI; `--strict` makes skipped and untrusted checks fail the run.

## Project notes

`basics export` creates or updates a `project` note for the folder: id = folder name (`-2`, `-3`... if the id is taken),
`path` absolute, `stack` grouped by layer, `status: active`. Its id is saved in `basics.json` as `project`. That note
collects `lessons` and the `last_checks` results, and is the link between the folder and the vault.

The MCP tool `record_project_outcome` proposes new lessons and tech-note updates for a project; they arrive in the inbox
like any other proposal.
