# Troubleshooting

## Start with doctor

```bash
basics doctor
basics doctor --fix
basics doctor --json
```

It checks Node, the config file, the vault, packs, inbox, embeddings and the port. `--fix` applies the repairs it knows:
it creates `basics.vault.json` when missing and writes the `.basics/.gitignore` in the vault. A warning is not always a
problem: `4747 in use` is fine when `basics ui` is already running.

## Common errors

**`Vault not found at <dir>`**
The resolved path does not exist. Run `basics init`, or point Basics at the right folder:

```bash
basics --vault ~/my-vault list
basics config set vault ~/my-vault
```

The resolution order is `--vault` > `BASICS_DIR` > config `vault` > `~/basics-vault`.

**`no basics.json in <dir>`**
`basics check` needs a project that has been exported. Run `basics export --stack <ids>` in the project first.

**Checks are skipped or marked untrusted**
Run `basics check --list` to see them, then `basics check` and answer `a` to trust one, or `basics check --trust` in CI.
`--strict` makes skipped and untrusted checks fail the run.

**A note is missing from the UI or the CLI**
`basics validate` reports schema errors, duplicate ids and broken links. Duplicate ids happen when the same filename
exists in two type folders; ids are global.

**A pack update does not appear**
`basics pack update` only proposes notes whose installed `source` is `pack:<name>@<version>` and that changed in the
shipped pack. Confirm the pack is installed with `basics pack list`, then `basics inbox list`.

**Recommendations are all zeros**
The vault has no matching `use_when`, `performs_best` or tags for that description. Add reasons to the tech notes, or
install a starter pack. Negative scores usually mean an `avoid_when` matched.

**`basics embeddings enable` aborts**
Without an interactive terminal it requires `--yes`. The download is about 500 MB; check free space and the cache path
(`BASICS_CACHE` or `~/.cache/basics`). `basics embeddings status` shows config, runtime, model cache and index state;
`basics embeddings reindex --full` rebuilds a damaged index.

**A check fails after upgrading a dependency**
Practices and checks can declare `since` / `until`. Run `basics detect` and re-export so `basics.json` has the detected
versions; checks outside the range are then filtered out. Review the output with `--verbose`.

## MCP client shows no tools

1. Restart the client after editing its config.
2. Use an absolute vault path in `args`.
3. For stdio, confirm the binary is on `PATH`: `Get-Command basics-mcp` on Windows, `which basics-mcp` elsewhere, or
   from a source checkout run `node packages/basics/dist/mcp/server.js <vault>`.
4. For HTTP, `basics ui` must be running and `http://127.0.0.1:4747/mcp` must be reachable; a different `--port` changes
   the URL.
5. On Windows, GUI clients may not find `basics-mcp` on `PATH`. Use `basics-mcp.cmd`, or `command: "node"` with the full
   path to `dist/mcp/server.js`.

## Stale UI after an upgrade

The UI is served from `packages/basics/dist/ui` and assets are hashed per build. After updating the package, stop and
restart `basics ui`, then hard-reload the browser (`Ctrl+Shift+R`, `⌘+Shift+R` on macOS). A normal reload can keep the old
`index.html` and the old asset URLs.

## Windows notes

- Config: `%USERPROFILE%\.config\basics\config.json`. `basics config path` prints the exact path.
- In JSON client configs, escape backslashes (`C:\\Users\\me\\vault`) or use forward slashes (`C:/Users/me/vault`).
- Global npm installs create `basics.cmd` and `basics-mcp.cmd`; some MCP clients need the `.cmd` suffix.
- `BASICS_DIR` works in PowerShell: `$env:BASICS_DIR = "C:\Users\me\vault"`.

**Port 4747 is busy**
Another `basics ui` is probably running. Use it, or start on another port: `basics ui --port 5000`. Remember to update
HTTP MCP configs to the new port.

**The UI is empty on a new vault**
Home shows the starter-pack onboarding; install a pack there or run `basics pack install core-layers` and reload.
