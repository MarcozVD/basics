# Security policy

## Supported versions

| Version | Supported |
| --- | --- |
| 1.x | Yes — fixes land in the latest release |
| < 1.0 | No |

Only the latest 1.x release receives security fixes. Pin the version if you script around the CLI and upgrade with
`npm install -g @marcozvd/basics@latest` (or the matching `@marcozvd/basics-core` version).

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub security advisories:

**https://github.com/MarcozVD/basics/security/advisories/new**

Do not open a public issue, discussion or pull request for a security problem. Include the affected version, a
reproduction (vault layout, commands or MCP calls), the impact and any mitigation you found. You will get an
acknowledgement and a coordinated disclosure timeline; credit is given in the advisory unless you prefer otherwise.

## Scope

Basics is a local-first tool. The security model is:

- **Local-only server** — `basics ui` binds to `127.0.0.1`, rejects requests whose `Host` or `Origin` is not a
  localhost origin, and exposes MCP over HTTP at `/mcp`. It is not designed to be exposed to a network or the internet.
- **Trust list** — `basics check` asks before running a command and stores approvals in
  `<vault>/.basics/trust.json`, keyed by `sha256(absolute directory + command)`. Moving a project or changing a
  command asks again. `--trust` skips the prompt and is meant for CI.
- **Inbox** — agents cannot write directly to the vault. `propose_note` and `record_project_outcome` create proposals
  in `inbox/`; nothing changes until you approve it, in the CLI or the UI.
- **Local files** — the vault is a plain folder and the config lives in `~/.config/basics/config.json` (override with
  `BASICS_CONFIG`). Keep normal filesystem permissions on both.

In scope: vulnerabilities in the CLI, HTTP API, MCP server, web UI, core library or official packs that break one of
those guarantees — for example a request that bypasses the Host/Origin check, an approval that writes without review,
or a trust-list key that can be forged across projects.

Out of scope: malicious content in notes or packs you install, commands you explicitly approve, an attacker who already
has read/write access to your user account or vault, vulnerabilities in third-party dependencies (report them upstream,
but tell us if Basics is affected), and the docs site hosting.

## Handling secrets

Basics does not need credentials or tokens to run. Do not paste secrets into notes, proposals or issue reports; the
vault is plain text, may be synced with git, and inbox diffs are meant to be shared when asking for help.
