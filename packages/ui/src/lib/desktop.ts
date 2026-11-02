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

function warn(action: string, error: unknown) {
  // A missing permission must never break the page: the title bar is chrome, not data.
  console.warn(`[basics] window ${action} failed`, error);
}

/** True only inside the Basics desktop app; false in every browser, worker and test without Tauri. */
export function isDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** macOS keeps its native traffic lights, so its header reserves room on the left. */
export function isMacos(): boolean {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.userAgent);
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
