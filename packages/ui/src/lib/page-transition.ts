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

/** Pixels the incoming page starts from, on the side it travels from. */
export const PAGE_ENTER_OFFSET = 12;
/** Pixels the outgoing page travels towards the opposite side. */
export const PAGE_EXIT_OFFSET = 6;
export const PAGE_ENTER_MS = 220;
export const PAGE_EXIT_MS = 120;
export const PAGE_REDUCED_MS = 100;
