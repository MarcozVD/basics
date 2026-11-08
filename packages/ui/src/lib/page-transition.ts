import type { NavigationType } from "react-router";

/**
 * Sidebar order, used only to decide which way a page change should travel.
 * Detail routes sit just after the list they belong to; Settings stays last.
 * Keep in sync with `NAV_LINKS` in `components/app/sidebar.tsx`.
 */
const ROUTE_RANKS: ReadonlyArray<readonly [path: string, rank: number]> = [
  ["/", 0],
  ["/explore", 1],
  ["/projects", 2],
  ["/graph", 3],
  ["/inbox", 4],
  ["/recommend", 5],
  ["/skills", 6],
  ["/settings", 7],
];

const NOTE_DETAIL_RANK = 1.5;
const INBOX_DETAIL_RANK = 4.5;

/** Higher numbers appear further down the sidebar. */
export function routeRank(pathname: string): number {
  if (pathname.startsWith("/notes/")) return NOTE_DETAIL_RANK;
  if (pathname.startsWith("/inbox/")) return INBOX_DETAIL_RANK;
  return ROUTE_RANKS.find(([path]) => path === pathname)?.[1] ?? 0;
}

/**
 * `+1` when the next page sits lower in the sidebar, `-1` when it sits higher.
 * History navigation always travels backwards, whatever the rank difference.
 */
export function pageDirection(from: string | null, to: string, navigationType: NavigationType): 1 | -1 {
  if (navigationType === "POP") return -1;
  if (!from || from === to) return 1;
  return routeRank(to) >= routeRank(from) ? 1 : -1;
}

/**
 * A one-shot direction for the next pathname change, set by in-app back when the target is a
 * parent route reached with a push (a deep link has no history entry to pop). Read during the
 * same render that consumes it, so a later navigation falls back to `pageDirection`.
 */
let pendingDirection: { pathname: string; direction: 1 | -1 } | null = null;

/** Ask the next page change into `pathname` to travel in `direction`. */
export function setNextDirection(pathname: string, direction: 1 | -1): void {
  pendingDirection = { pathname, direction };
}

/** The requested direction for `pathname`, cleared once read. */
export function takeNextDirection(pathname: string): 1 | -1 | null {
  if (!pendingDirection || pendingDirection.pathname !== pathname) return null;
  const direction = pendingDirection.direction;
  pendingDirection = null;
  return direction;
}

/**
 * Whether the latest pathname change was an in-app back. A pop carries this in the
 * navigation type, but a deep link's fallback to its parent is a replace, so the shell
 * has to remember that it asked for a backwards move.
 */
let backNavigation = false;

/** Record that the current pathname change is (or is not) an in-app back. */
export function markBackNavigation(value: boolean): void {
  backNavigation = value;
}

/** True when the latest pathname change was an in-app back. */
export function isBackNavigation(): boolean {
  return backNavigation;
}

/**
 * Whether the shell has navigated since it loaded. The first load is a POP too, so the page
 * header needs this to tell "arrived by back" from "this is where the tab opened".
 */
let navigated = false;

/** Record that at least one in-app navigation has happened since load. */
export function markNavigated(): void {
  navigated = true;
}

/** True once the shell has navigated at least once since it loaded. */
export function hasNavigated(): boolean {
  return navigated;
}

/**
 * A counter bumped on every navigation. A heavy page that boots in deferred steps (the graph
 * canvas) reads it before each step: if the shell has moved on since the mount, leaving during
 * the first layout abandons the work instead of blocking the page that replaced it.
 */
let navigationEpoch = 0;

/** Record that the shell navigated, so deferred work can notice the page was left. */
export function bumpNavigationEpoch(): void {
  navigationEpoch += 1;
}

/** The current navigation epoch; a mount captures it and compares it before heavy work. */
export function currentNavigationEpoch(): number {
  return navigationEpoch;
}

/**
 * The pathname the shell last committed. A `popstate` fires after the URL has already moved
 * but before React Router commits, so this is the only way to tell a real route change from
 * a history move that only changes the query.
 */
let committedPathname: string | null = null;

/** Record the pathname of the route the shell has just rendered. */
export function markCommittedPathname(pathname: string): void {
  committedPathname = pathname;
}

type NavigationIntentListener = () => void;

const intentListeners = new Set<NavigationIntentListener>();

/**
 * Run `listener` when an in-app navigation starts, synchronously inside the click, key press or
 * popstate and before React commits it. A page that has already queued heavy rendering for the
 * route being left can cancel it here; this is the only moment early enough to do so. Returns a
 * disposer.
 */
export function onNavigationIntent(listener: NavigationIntentListener): () => void {
  intentListeners.add(listener);
  return () => {
    intentListeners.delete(listener);
  };
}

/**
 * Signal an in-app navigation that did not start with a link activation: a shortcut, the
 * command palette, a toast action or one of the history buttons. Call this synchronously
 * before `navigate`, so deferred page work can abandon before React commits the route.
 */
export function beginNavigation(): void {
  bumpNavigationEpoch();
  for (const listener of intentListeners) listener();
}

/**
 * The earliest moment an in-app navigation is observable: a link activation that changes the
 * pathname, or a browser history move. React Router commits the new location a frame or more
 * later, and by then the outgoing page may already be blocked in heavy work of its own (the
 * graph's first render), so the commit-time bump is too late to abandon it. Bumping on the
 * click or popstate lets deferred boot steps see the departure before they start. A navigation
 * that only changes the query keeps the same page (and its canvas) and must not count;
 * modified clicks, downloads and external links are not in-app navigations either.
 *
 * The popstate listener is registered in the capture phase (and before React Router's own
 * listener), because the URL has already moved when the event fires and the router's listener
 * would otherwise process the history move first.
 *
 * Returns a disposer for the shell to uninstall on unmount.
 */
export function observeNavigationIntent(): () => void {
  const onClick = (event: MouseEvent) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest?.("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (anchor.hasAttribute("download")) return;
    if (anchor.target && anchor.target !== "_self") return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
    beginNavigation();
  };
  const onPopState = () => {
    const pathname = window.location.pathname;
    // The first observation after load has nothing to compare against; the shell render
    // records the committed pathname, so this only happens before its first effect.
    if (committedPathname === null) {
      committedPathname = pathname;
      return;
    }
    if (pathname === committedPathname) return;
    beginNavigation();
  };
  document.addEventListener("click", onClick, true);
  window.addEventListener("popstate", onPopState, true);
  return () => {
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("popstate", onPopState, true);
  };
}

/** Pixels the incoming page starts from, on the side it travels from. */
export const PAGE_ENTER_OFFSET = 12;
/** Pixels the outgoing page travels towards the opposite side. */
export const PAGE_EXIT_OFFSET = 6;
export const PAGE_ENTER_MS = 220;
export const PAGE_EXIT_MS = 120;
export const PAGE_REDUCED_MS = 100;
