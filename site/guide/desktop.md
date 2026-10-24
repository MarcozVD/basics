# Desktop app

The Basics desktop app is a small, standalone window that runs the **exact same server and UI** as
[`basics ui`](web-ui): a local web app that also serves MCP over HTTP. The only difference is how it is
_served_ — the app bundles its own Node.js runtime and ships the CLI inside, so you do **not** need Node.js, npm or
any command line to use Basics.

Behind the scenes the app starts `basics ui` (bundled) on `http://127.0.0.1:4747` and shows that page in the window.
Your vault, packs and notes are managed exactly as with the CLI and the web UI.

## Install

Installers are unsigned and attached to the [GitHub Releases](https://github.com/MarcozVD/basics/releases) page as
draft-ready artifacts. Download the one for your OS:

| OS | File | How to open it the first time |
| --- | --- | --- |
| Windows | `Basics_1.2.0_x64_en-US.msi` or `Basics_1.2.0_x64-setup.exe` | SmartScreen will warn that the publisher is unknown. Click **More info** → **Run anyway**. |
| macOS (universal) | `Basics_1.2.0_universal.dmg` | Unsigned, so right-click the downloaded `.dmg` (or the `Basics.app` inside) and choose **Open**, or open **System Settings → Privacy & Security** and click **Open Anyway** next to the blocked app. |
| Linux | `Basics_1.2.0_amd64.AppImage` or `Basics_1.2.0_amd64.deb` | For the AppImage: `chmod +x Basics_*.AppImage` and run it. The `.deb` installs normally (e.g. `sudo dpkg -i` or your package manager). |

## First run

On the very first launch there is no vault yet. The window shows a **Choose vault folder…** button:

1. Pick an empty folder (or an existing Basics vault). Basics runs `basics init <that folder> --packs none` in it —
   no note packs are installed — and then starts the normal onboarding in the UI.
2. If you already have a vault, either point the folder picker at it, or configure it beforehand (see
   [Config](#config-and-vault-location)).

## How it connects

- If a Basics server is **already running on port 4747** (for example from `basics ui` in a terminal), the app
  **attaches to it** instead of starting another one, and it never stops a server it did not start.
- Otherwise the app starts its own server on **port 4747**; if that port is busy, it picks a free one automatically.
- A small loading page shows "Starting Basics…" until the server answers `GET /api/health`, then the window loads it.

## Tray and window behaviour

- **Closing the window hides it** — the server keeps running, so MCP keeps working for your agents. Use the tray menu
  (or **Quit Basics**) to actually stop it.
- The tray menu:
  - **Open Basics** — show the window again.
  - **Copy MCP URL** — copies `http://127.0.0.1:<port>/mcp` to the clipboard (the port the app is actually serving on).
  - **Open vault folder** — opens your vault directory in the file manager.
  - **Start at login** — checkbox, off by default. Starts the app (and therefore the server) when you sign in.
  - **Check for updates** — opens the GitHub Releases page in your browser.
  - **Quit Basics** — stops the server the app started and exits. If the app only attached to an existing server, it
    simply exits and leaves that server running.
- **Single instance**: launching the app a second time focuses the already open window instead of starting a new one.
- **External links** (for example a link that leaves the vault's local page, or `mailto:`) open in your system browser.

## Connecting your agents

The app serves MCP over HTTP at `http://127.0.0.1:<port>/mcp`, exactly like `basics ui`. Use **Copy MCP URL** from the
tray menu, then register it with your client:

```bash
claude mcp add --transport http basics <copied-url>
```

For example, with the default port:

```bash
claude mcp add --transport http basics http://127.0.0.1:4747/mcp
```

Other clients are covered in [MCP clients](mcp-clients).

## Config and vault location

The app uses the same configuration as the CLI:

- **Config file**: `~/.config/basics/config.json` (or `$BASICS_CONFIG` if you set it).
- **Vault**: the `vault` setting in that config decides which folder the server uses; with no config, Basics falls back
  to its default vault location. You can point the **Choose vault folder…** picker at any vault on first run.

## Updates

There is **no automatic updater** yet. Check the GitHub Releases page for new versions and install the new installer
over the old one; your vault and config are untouched.

## Uninstall

- **Windows**: Settings → Apps → **Basics** → Uninstall (or the uninstaller in the start-menu entry).
- **macOS**: drag the **Basics** app to the Trash. (If you set **Start at login**, disable it first.)
- **Linux**: `sudo dpkg -r basics` for the `.deb` install, or just delete the AppImage you downloaded.

Uninstalling the app does not delete your vault folder.
