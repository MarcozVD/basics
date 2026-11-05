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

/** Pixels the incoming page starts from, on the side it travels from. */
export const PAGE_ENTER_OFFSET = 12;
/** Pixels the outgoing page travels towards the opposite side. */
export const PAGE_EXIT_OFFSET = 6;
export const PAGE_ENTER_MS = 220;
export const PAGE_EXIT_MS = 120;
export const PAGE_REDUCED_MS = 100;
