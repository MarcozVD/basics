/**
 * Update state for the desktop app, shared by the update banner and Settings → Updates.
 *
 * The page never talks to the Tauri updater plugin: the Rust side exposes three commands
 * (`check_update`, `install_update`, `desktop_version`) that take no URL or path, and the
 * endpoint plus signing key only ever come from `tauri.conf.json`. This module keeps one
 * snapshot of what the last check found and fans it out to both surfaces.
 *
 * The automatic check runs once per app session, in the background, and stays silent when
 * it fails (a laptop may simply be offline). A manual check in Settings always reports.
 */

import { useSyncExternalStore } from "react";
import { isDesktop, readDesktopSettings } from "@/lib/desktop";

export interface UpdateInfo {
  version: string;
  notes: string | null;
  /** Calendar date of the release (`YYYY-MM-DD`). */
  date: string | null;
}

export type UpdatePhase = "idle" | "checking" | "available" | "downloading" | "installing" | "current" | "error";

export interface UpdateSnapshot {
  phase: UpdatePhase;
  /** Version of the running app, from Rust (`desktop_version`). */
  version: string | null;
  /** The newest release, when one is available. */
  update: UpdateInfo | null;
  downloaded: number;
  total: number | null;
  /** Message from the last manual check or install attempt. */
  error: string | null;
  /** A check has finished at least once (its failure may have been silent). */
  checked: boolean;
  /** "Later" was pressed for `update.version`; stays hidden until the app closes. */
  dismissed: boolean;
}

/** Event the Rust side emits while the signed installer downloads. */
const PROGRESS_EVENT = "basics:update-progress";
/** `sessionStorage` key: a fresh app launch shows the banner again. */
const DISMISS_KEY = "basics.update.dismissed";

type UpdateProgress = { phase: "download"; downloaded: number; total: number | null } | { phase: "install" };

const initial: UpdateSnapshot = {
  phase: "idle",
  version: null,
  update: null,
  downloaded: 0,
  total: null,
  error: null,
  checked: false,
  dismissed: false,
};

let snapshot = initial;
const listeners = new Set<() => void>();
let started = false;

function set(patch: Partial<UpdateSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function dismissedVersion(): string | null {
  try {
    return sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

function rememberDismissed(version: string) {
  try {
    sessionStorage.setItem(DISMISS_KEY, version);
  } catch {
    // Private mode without storage: the banner simply comes back on the next page load.
  }
}

async function invoke<T>(command: string): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUpdateState(): UpdateSnapshot {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => snapshot,
  );
}

/** Progress events keep the banner honest while a few MB download. */
async function watchProgress(): Promise<void> {
  try {
    const { listen } = await import("@tauri-apps/api/event");
    await listen<UpdateProgress>(PROGRESS_EVENT, (event) => {
      const payload = event.payload;
      if (payload.phase === "download") set({ phase: "downloading", downloaded: payload.downloaded, total: payload.total });
      else set({ phase: "installing", total: null });
    });
  } catch (cause) {
    // No progress means the banner still shows the download, just without a bar.
    console.warn("[basics] could not listen for update progress", cause);
  }
}

/**
 * Starts the updater for this page: installed version, progress events and (unless the owner
 * turned it off) one background check. Safe to call more than once; only the first counts.
 */
export function startUpdater(): void {
  if (started || !isDesktop()) return;
  started = true;

  void (async () => {
    await watchProgress();
    try {
      set({ version: await invoke<string>("desktop_version") });
    } catch (cause) {
      console.warn("[basics] could not read the installed version", cause);
    }

    let checkOnStart = true;
    try {
      checkOnStart = (await readDesktopSettings())?.checkUpdatesOnStart ?? true;
    } catch (cause) {
      console.warn("[basics] could not read the desktop settings", cause);
    }
    if (checkOnStart) void checkForUpdates({ silent: true });
  })();
}

/** Asks the update server once. `silent` is the launch check: a failure only goes to the log. */
export async function checkForUpdates({ silent = false }: { silent?: boolean } = {}): Promise<void> {
  if (!isDesktop()) return;
  if (snapshot.phase === "checking" || snapshot.phase === "downloading" || snapshot.phase === "installing") return;

  set({ phase: "checking", error: null });
  try {
    const info = await invoke<UpdateInfo | null>("check_update");
    if (!info) {
      set({ phase: "current", update: null, checked: true, downloaded: 0, total: null, error: null });
      return;
    }
    set({
      phase: "available",
      update: info,
      checked: true,
      downloaded: 0,
      total: null,
      error: null,
      dismissed: dismissedVersion() === info.version,
    });
  } catch (cause) {
    if (silent) {
      console.warn("[basics] update check failed", cause);
      set({ phase: "idle", checked: true });
    } else {
      set({ phase: "error", error: errorText(cause), checked: true });
    }
  }
}

/**
 * Downloads, verifies and installs the release found by the last check. Windows exits the
 * app into the installer; elsewhere the app relaunches once the bundle is replaced.
 */
export async function installUpdate(): Promise<void> {
  if (!isDesktop() || !snapshot.update) return;
  if (snapshot.phase === "downloading" || snapshot.phase === "installing") return;

  set({ phase: "downloading", downloaded: 0, total: null, error: null });
  try {
    await invoke<void>("install_update");
    set({ phase: "installing", total: null });
  } catch (cause) {
    set({ phase: "available", error: errorText(cause) });
  }
}

/** "Later": hides the banner for this version until the app is started again. */
export function dismissUpdate(): void {
  if (snapshot.update) rememberDismissed(snapshot.update.version);
  set({ dismissed: true });
}
