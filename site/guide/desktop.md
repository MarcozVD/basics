# Desktop app

The Basics desktop app is a small, standalone window that runs the **exact same server and UI** as
[`basics ui`](web-ui): a local web app that also serves MCP over HTTP. The only difference is how it is
_served_ — the app bundles its own Node.js runtime and ships the CLI inside, so you do **not** need Node.js, npm or
any command line to use Basics.

Behind the scenes the app starts `basics ui` (bundled) on `http://127.0.0.1:4747` and shows that page in the window.
Your vault, packs and notes are managed exactly as with the CLI and the web UI.

## Install

Installers are not code-signed by Windows or macOS, so the system warns when you open them (see the table below). Each
installer is signed for the in-app updater, which only installs updates that match that signature. The installers are
attached to each desktop release on GitHub (tags named `desktop-v<version>`, for example
[desktop-v1.4.1](https://github.com/MarcozVD/basics/releases/tag/desktop-v1.4.1)); see
[all desktop releases](https://github.com/MarcozVD/basics/releases?q=desktop-v&expanded=true). Download the one for
your OS (`<version>` is the release number, such as `1.4.1`):

| OS | File | How to open it the first time |
| --- | --- | --- |
| Windows | `Basics_<version>_x64_en-US.msi` or `Basics_<version>_x64-setup.exe` | SmartScreen will warn that the publisher is unknown. Click **More info** → **Run anyway**. |
| macOS (universal) | `Basics_<version>_universal.dmg` | Unsigned, so right-click the downloaded `.dmg` (or the `Basics.app` inside) and choose **Open**, or open **System Settings → Privacy & Security** and click **Open Anyway** next to the blocked app. |
| Linux | `Basics_<version>_amd64.AppImage`, `Basics_<version>_amd64.deb` or `Basics-<version>-1.x86_64.rpm` | For the AppImage: `chmod +x Basics_*.AppImage` and run it (Ubuntu 22.04/24.04 also need `libfuse2`). The `.deb` installs with `sudo dpkg -i` or your package manager; the `.rpm` with `sudo dnf install ./Basics-*.rpm`. |

On GNOME, the tray icon needs the AppIndicator/KStatusNotifierItem extension (for example `gnome-shell-extension-appindicator`). Without it
the app still runs and serves MCP; only the tray menu is missing.

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

- **Closing the window hides it** by default — the server keeps running, so MCP keeps working for your agents. Use the
  tray menu (or **Quit Basics**) to actually stop it. Settings → Startup can change the close button to quit the app
  instead (see [Desktop settings](#desktop-settings)).
- The tray menu:
  - **Open Basics** — show the window again.
  - **Settings...** — show the window on the Settings page.
  - **Copy MCP URL** — copies `http://127.0.0.1:<port>/mcp` to the clipboard (the port the app is actually serving on).
  - **Open vault folder** — opens your vault directory in the file manager.
  - **Start at login** — checkbox, off by default. Starts the app (and therefore the server) when you sign in. It is the
    same setting as Settings → Startup.
  - **Check for updates** — opens the GitHub Releases page in your browser.
  - **Quit Basics** — stops the server the app started and exits. If the app only attached to an existing server, it
    simply exits and leaves that server running.
- **Single instance**: launching the app a second time focuses the already open window instead of starting a new one.
- **External links** (for example a link that leaves the vault's local page, or `mailto:`) open in your system browser.

## Title bar and window controls

On Windows and Linux the app has no system title bar. A thin strip above the content holds the window controls:

- Drag the empty part of the strip, or the top of the sidebar, to move the window.
- Double-click the strip or the top of the sidebar to maximize; double-click again to restore.
- **Minimize**, **Maximize / Restore** and **Close** sit at the top right. **Close** hides the window to the tray, like
  the window close described above; the server keeps running.
- Drag any edge or corner of the window to resize it, on the loading page too. A maximized window does not resize.

On macOS the window keeps its native traffic-light buttons, drawn over the top of the sidebar, which leaves room for them.

A browser opened with `basics ui` has no strip, no window controls and no drag area: the page starts at the top of the
window, and the browser draws its own tabs and address bar.

## What the app window can do

The page the app shows is served from `127.0.0.1`, and the app treats it as a remote page with a short list of allowed
app commands:

- window controls: minimize, maximize and restore, close, drag, and checking whether the window is maximized;
- desktop settings: read and save the startup and close options;
- vault: open the vault folder, and choose a new vault folder.

None of these takes a path from the page. **Open folder** opens the vault the running server reports, and **Change
folder** accepts only a folder picked in the native dialog. The page has no permission to run programs, read or write
files directly, or open URLs through the app. Everything else keeps the limits described in [Security](security).

## Keyboard and browser behaviour

The app window is an application, not a browser tab, so the browser's own keys and menus are turned off inside it.
A browser running the same UI (`basics ui`) keeps all of them.

- **Ctrl+F** / **⌘F** opens the command palette in search mode, with the field empty and focused. Pressing it again
  while the palette is open clears the query. It does not open the browser find bar, and on Explore and Graph it opens
  the palette instead of their own filter field.
- **Ctrl+S** / **⌘S** saves the note in the editor and does nothing else.
- Off: reload (F5, Ctrl+R, Ctrl+Shift+R), print (Ctrl+P), view source (Ctrl+U), downloads (Ctrl+J), history (Ctrl+H),
  find next (F3, Ctrl+G), caret browsing (F7), zoom (Ctrl and `+`, `-`, `0`, Ctrl+mouse wheel, trackpad pinch) and back / forward
  (Alt+Left, Alt+Right) on a page.
- Inside a text field, the editing keys keep working: copy, paste, cut, select all and undo. On macOS, Ctrl keeps its
  caret movement keys inside fields.
- Right-click shows no browser menu, except in fields (inputs and the note editor), where you get copy and paste.
- Links and images cannot be dragged out of the window. The title strip and the top of the sidebar cannot be selected with
  the mouse; text on the page can.

**DevTools** (F12, Ctrl+Shift+I) are not available in the installed app. The Windows release turns off WebView2's
browser keys, and the app has no menu to open them. Development builds (`npm run desktop:dev`) keep those keys on, so
F12 opens DevTools there. In development builds, F5, Ctrl+P and Ctrl+R can still act inside WebView2 even though the
page cancels them where it can. On Linux and macOS the page-level filter is the only guard.

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

## Desktop settings

Settings → **Startup** in the app holds the options that only the desktop app has. Changes apply as soon as you pick
them; there is no Save button.

- **Start Basics when I sign in** — registers the app as a login item. Off by default. The tray's **Start at login**
  checkbox is the same setting.
- **Start minimized** — whether a launch hides the window, leaving only the tray icon and the server:
  - **Never** (default): the window always shows.
  - **When I sign in**: hidden only when the app starts at sign-in. A normal launch shows the window.
  - **Always**: hidden on every launch. Open the window from the tray with **Open Basics**.
- **Closing the window**:
  - **Keep running in the tray** (default): the close button hides the window; the server and MCP keep running.
  - **Quit Basics**: the close button quits the app, as **Quit Basics** in the tray does.

The values are saved as `desktop-settings.json` in the app's config folder. A missing or damaged file means the
defaults, so the app still starts.

**General → Vault folder** has two buttons:

- **Open folder** opens the vault in your file manager.
- **Change folder** asks for confirmation, then shows the folder picker. The folder you pick is set up as a vault with
  `basics init`, the same as on first run, and the server restarts with it. Notes in the old folder are not moved.
  Cancel changes nothing.

**Settings → Updates** shows the installed version, the result of the last check, **Check now**, and the **Check for
updates on start** switch. See [Updates](#updates).

## Config and vault location

The app uses the same configuration as the CLI:

- **Config file**: `~/.config/basics/config.json` (or `$BASICS_CONFIG` if you set it).
- **Vault**: the `vault` setting in that config decides which folder the server uses; with no config, Basics falls back
  to its default vault location. You can point the **Choose vault folder…** picker at any vault on first run.

## Updates

The desktop app can update itself. When it starts, it checks for a new version and, if there is one, shows a card in
the top-right corner with the version, the release date, **What's new** (the release notes) and **Update and restart**.
**Later** hides the card until the next start.

**Update and restart** downloads the new version with a progress bar, closes the app, installs it and opens the new
version. Your vault and config are untouched. If the download or install fails, the card says why in plain words and
offers **Try again**.

- **Check for updates on start** (Settings → Updates, on by default): turn it off and the app makes no update check when
  it starts. **Check now** on the same page still checks on demand.
- Offline starts are fine: the app opens normally and the check simply does not show anything. A manual check shows the
  reason if it cannot reach the release server.
- Only signed updates are installed. The app trusts the public key built into it, and nothing else.
- The first version with the updater must be installed by hand, once, from the GitHub Releases page. Later versions
  arrive through the card.
- The Windows installer is the one tested end to end so far. The macOS and Linux builds include the same updater, but
  updating them has not been tested yet; if an update fails there, install the new version from the Releases page.

The card only appears in the desktop app; the browser UI has no updater.

## Uninstall

- **Windows**: Settings → Apps → **Basics** → Uninstall (or the uninstaller in the start-menu entry).
- **macOS**: drag the **Basics** app to the Trash. (If you set **Start at login**, disable it first.)
- **Linux**: `sudo dnf remove basics` for the `.rpm`, `sudo dpkg -r basics` for the `.deb`, or just delete the AppImage you downloaded.

Uninstalling the app does not delete your vault folder.
