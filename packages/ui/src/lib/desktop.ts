/**
 * Desktop (Tauri) detection and the few window commands the custom title bar needs.
 *
 * The desktop app does not ship its own UI: it points the window at the same server
 * `basics ui` runs, so a browser and the app load the very same bundle. Tauri injects
 * `__TAURI_INTERNALS__` into every page of its webviews (bundled pages included), so
 * that global is the runtime signal. In a plain browser nothing is defined and every
 * wrapper here stays unused.
 *
 * `@tauri-apps/api` is imported dynamically so its code lands in a chunk the browser
 * only requests when someone presses a window button, never in the first paint.
 */

/** The window commands that need the `app-window` capability (see apps/desktop). */
async function appWindow() {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow();
}

/** The app's own commands; each one is granted explicitly to the remote capability. */
async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function warn(action: string, error: unknown) {
  // A missing permission must never break the page: the title bar is chrome, not data.
  console.warn(`[basics] window ${action} failed`, error);
}

/** True only inside the Basics desktop app; false in every browser, worker and test without Tauri. */
export function isDesktop(): boolean {
  return import.meta.env.MODE !== "demo" && typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** macOS keeps its native traffic lights, so its header reserves room on the left. */
export function isMacos(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
}

/** A shortcut chord: `⌘K` on macOS, `Ctrl+K` everywhere else. */
export function modChord(key: string): string {
  return isMacos() ? `⌘${key}` : `Ctrl+${key}`;
}

export async function minimizeWindow(): Promise<void> {
  try {
    await (await appWindow()).minimize();
  } catch (error) {
    warn("minimize", error);
  }
}

export async function toggleMaximizeWindow(): Promise<void> {
  try {
    await (await appWindow()).toggleMaximize();
  } catch (error) {
    warn("toggle maximize", error);
  }
}

/** Asks the app to close; the Rust side hides the window to the tray instead of quitting. */
export async function closeWindow(): Promise<void> {
  try {
    await (await appWindow()).close();
  } catch (error) {
    warn("close", error);
  }
}

/**
 * Reports the maximize state now and on every resize (maximize, restore, snap and
 * manual resize all emit one), so the title bar can pick its Maximize/Restore icon.
 * Returns the unsubscribe function, safe to call before the first report arrives.
 */
export function watchMaximized(onChange: (maximized: boolean) => void): () => void {
  let unlisten: (() => void) | undefined;
  let stopped = false;

  void (async () => {
    try {
      const window = await appWindow();
      const report = async () => {
        try {
          onChange(await window.isMaximized());
        } catch (error) {
          warn("state", error);
        }
      };
      await report();
      if (stopped) return;
      const off = await window.onResized(() => void report());
      if (stopped) off();
      else unlisten = off;
    } catch (error) {
      warn("resize listener", error);
    }
  })();

  return () => {
    stopped = true;
    unlisten?.();
    unlisten = undefined;
  };
}

/* ---------------------------------------------------------------------------------------
 * Desktop settings (Settings → Startup) and the two vault actions in Settings → General.
 *
 * Rust owns the values: they live in `desktop-settings.json` in the app config dir and
 * are read at startup, so a page load is only a mirror. The wire shape is the Rust
 * struct, snake_case keys included.
 * ------------------------------------------------------------------------------------- */

export type StartMinimized = "never" | "login" | "always";
export type CloseBehavior = "tray" | "quit";

export interface DesktopSettings {
  /** Mirrors the operating system's login item; the app reports the live state. */
  startAtLogin: boolean;
  startMinimized: StartMinimized;
  closeBehavior: CloseBehavior;
  /** Check the update server once per launch; missing in older settings files means on. */
  checkUpdatesOnStart: boolean;
}

interface WireDesktopSettings {
  start_at_login: boolean;
  start_minimized: StartMinimized;
  close_behavior: CloseBehavior;
  check_updates_on_start: boolean;
}

function fromWire(settings: WireDesktopSettings): DesktopSettings {
  return {
    startAtLogin: settings.start_at_login,
    startMinimized: settings.start_minimized,
    closeBehavior: settings.close_behavior,
    checkUpdatesOnStart: settings.check_updates_on_start,
  };
}

function toWire(settings: DesktopSettings): WireDesktopSettings {
  return {
    start_at_login: settings.startAtLogin,
    start_minimized: settings.startMinimized,
    close_behavior: settings.closeBehavior,
    check_updates_on_start: settings.checkUpdatesOnStart,
  };
}

/** The stored settings, or `null` in a browser (no app to ask). */
export async function readDesktopSettings(): Promise<DesktopSettings | null> {
  if (!isDesktop()) return null;
  return fromWire(await invokeCommand<WireDesktopSettings>("get_desktop_settings"));
}

/** Saves every field and returns what Rust stored, which is the truth for `startAtLogin`. */
export async function writeDesktopSettings(settings: DesktopSettings): Promise<DesktopSettings> {
  if (!isDesktop()) throw new Error("the desktop settings only exist in the desktop app");
  return fromWire(await invokeCommand<WireDesktopSettings>("set_desktop_settings", { settings: toWire(settings) }));
}

/**
 * Opens the native folder picker, sets the folder up as a vault (`basics init`) and
 * restarts the bundled server. Resolves `false` when the picker was dismissed.
 */
export async function chooseVaultFolder(): Promise<boolean> {
  if (!isDesktop()) throw new Error("choosing a vault folder needs the desktop app");
  return invokeCommand<boolean>("choose_vault");
}

/** Shows the configured vault folder in the system file manager. */
export async function openVaultFolder(): Promise<void> {
  if (!isDesktop()) throw new Error("opening the vault folder needs the desktop app");
  await invokeCommand<void>("open_vault_folder");
}
