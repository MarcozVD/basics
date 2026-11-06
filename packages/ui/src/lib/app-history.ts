import { useEffect, useMemo } from "react";
import { type NavigationType, useLocation, useNavigate } from "react-router";
import { type TranslationKey, useI18n } from "@/i18n";
import { isEditableTarget } from "@/lib/desktop-shell";
import { setNextDirection } from "@/lib/page-transition";

/**
 * The app's own view of browser history.
 *
 * React Router already keeps a history stack, but the shell needs more than the router exposes:
 * whether there is an in-app entry to go back to (so a deep link never leaves the app), and the
 * scroll offset of every entry (so back restores where the user was, filters included). This
 * module mirrors the router's pushes, replaces and pops and stores the offset per `location.key`.
 *
 * The mirror lives in `sessionStorage` so a reload keeps it, and a module-level cache keeps reads
 * cheap during a render.
 */

export interface HistoryEntry {
  key: string;
  pathname: string;
  search: string;
  scroll: number;
}

const STORAGE_KEY = "basics:app-history";
/** A session never needs more than this; the oldest entries fall off the front. */
const MAX_ENTRIES = 100;

interface HistoryStore {
  entries: HistoryEntry[];
  /** Index of the entry the router is on, or -1 before the first navigation. */
  index: number;
}

function emptyStore(): HistoryStore {
  return { entries: [], index: -1 };
}

function load(): HistoryStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as HistoryStore;
    if (Array.isArray(parsed.entries) && typeof parsed.index === "number") return parsed;
  } catch {
    // A corrupt value only costs the mirror, never the app.
  }
  return emptyStore();
}

let store: HistoryStore = load();

function persist(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Private mode or a full quota: the mirror still works in memory.
  }
}

/** Mirror one router navigation. Idempotent per key, so a double render records once. */
export function recordNavigation(key: string, pathname: string, search: string, navigationType: NavigationType): void {
  const existing = store.entries.findIndex((entry) => entry.key === key);
  if (existing >= 0) {
    const entry = store.entries[existing];
    if (entry && navigationType === "REPLACE") {
      entry.pathname = pathname;
      entry.search = search;
    }
    store.index = existing;
  } else {
    // A push (or a pop to an entry we never recorded) drops anything ahead of the cursor.
    const kept = store.index >= 0 ? store.entries.slice(0, store.index + 1) : [];
    kept.push({ key, pathname, search, scroll: 0 });
    store.entries = kept.slice(-MAX_ENTRIES);
    store.index = store.entries.length - 1;
  }
  persist();
}

/** Remember where the user was, without touching storage on every scroll tick. */
export function saveScroll(key: string, scroll: number): void {
  const entry = store.entries.find((candidate) => candidate.key === key);
  if (entry && entry.scroll !== scroll) entry.scroll = scroll;
}

/** The saved offset for a history entry. */
export function scrollFor(key: string): number {
  return store.entries.find((entry) => entry.key === key)?.scroll ?? 0;
}

/** True when a previous in-app entry exists, so back stays inside the app. */
export function canGoBack(): boolean {
  return store.index > 0;
}

/** True when the router moved back and a forward entry is still available. */
export function canGoForward(): boolean {
  return store.index >= 0 && store.index < store.entries.length - 1;
}

function previousEntry(): HistoryEntry | undefined {
  return store.entries[store.index - 1];
}

/** The route a deep link falls back to when there is no in-app entry to return to. */
export function parentRoute(pathname: string): string | null {
  if (pathname.startsWith("/notes/")) return "/explore";
  if (pathname.startsWith("/inbox/")) return "/inbox";
  return null;
}

const ROUTE_LABEL: Readonly<Record<string, TranslationKey>> = {
  "/": "nav.home",
  "/explore": "nav.explore",
  "/projects": "nav.projects",
  "/graph": "nav.graph",
  "/inbox": "nav.inbox",
  "/recommend": "nav.recommend",
  "/skills": "nav.skills",
  "/settings": "nav.settings",
};

/** The name of a destination, so the back label says where it goes. */
export function destinationLabel(pathname: string, t: (key: TranslationKey, vars?: Record<string, string | number>) => string): string {
  if (pathname.startsWith("/notes/")) return t("nav.explore");
  if (pathname.startsWith("/inbox/")) return t("nav.inbox");
  const base = pathname === "/" ? "/" : `/${pathname.split("/")[1] ?? ""}`;
  const key = ROUTE_LABEL[base];
  return key ? t(key) : t("nav.home");
}

export interface BackTarget {
  /** Destination name, e.g. "Explore". */
  label: string;
  /** Runs the in-app back. */
  go: () => void;
}

/**
 * Where a detail view's back goes: the previous in-app entry when there is one (its search
 * params and scroll come back with it), otherwise the parent route for a deep link. `null`
 * on a top-level page, which has nowhere to go back to.
 */
export function useBackTarget(): BackTarget | null {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const { pathname, key } = location;
  return useMemo(() => {
    const previous = previousEntry();
    if (previous && previous.key !== key && previous.pathname !== pathname) {
      return { label: destinationLabel(previous.pathname, t), go: () => navigate(-1) };
    }
    const parent = parentRoute(pathname);
    if (!parent) return null;
    return {
      label: destinationLabel(parent, t),
      go: () => {
        setNextDirection(parent, -1);
        navigate(parent, { replace: true });
      },
    };
  }, [pathname, key, navigate, t]);
}

/** Alt+Left/Right and the mouse back/forward buttons, in the browser and the desktop app. */
export function useHistoryShortcuts(): void {
  const navigate = useNavigate();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      // A field keeps its own arrows: Option+Arrow moves the caret on macOS.
      if (isEditableTarget(event.target)) return;
      // Cancel the browser's own history even at the ends, so the app is never left.
      event.preventDefault();
      if (event.key === "ArrowLeft") {
        if (canGoBack()) navigate(-1);
      } else if (canGoForward()) {
        navigate(1);
      }
    };
    const onMouseButton = (event: MouseEvent) => {
      if (event.button !== 3 && event.button !== 4) return;
      // A side-button press produces both `mouseup` and `auxclick` in Chrome. Navigate on the
      // completed `auxclick` only, so one press moves one entry; cancel the browser's own
      // history move on both, so the app is never left.
      event.preventDefault();
      if (event.type !== "auxclick") return;
      if (event.button === 3) {
        if (canGoBack()) navigate(-1);
      } else if (canGoForward()) {
        navigate(1);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("mouseup", onMouseButton);
    window.addEventListener("auxclick", onMouseButton);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("mouseup", onMouseButton);
      window.removeEventListener("auxclick", onMouseButton);
    };
  }, [navigate]);
}

/** Exposed for tests: reset the in-memory mirror. */
export function resetAppHistory(): void {
  store = emptyStore();
  persist();
}
