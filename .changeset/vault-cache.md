---
"@marcozvd/basics": patch
"@marcozvd/basics-core": patch
---

The app and the MCP server answer faster on big vaults.

- The UI server and the MCP server keep the parsed vault in memory and reload it only when a note file changes. Before, every request and every tool call re-read the whole vault. On an 866-note vault a warm `/api/graph` went from about 700 ms to a few milliseconds, and MCP tools from about 670 ms to about 16 ms.
- Edits made in an editor or by `git pull` are still seen by the next request or tool call. Inbox proposals are read from disk every time.
- Core exports `VaultCache`, `vaultSignature` and `vaultSignatureAsync` for code that holds a vault across calls.
