import type { QueryClient } from "@tanstack/react-query";
import { getConfig, getConnectStatus, getGraph, getInbox, getLayers, getNotes, getSkills, getStats } from "./api";
import { queryKeys } from "./queries";

/**
 * Route modules, kept in one place so both the lazy routes (`App`) and the sidebar's
 * intent prefetch load the exact same dynamic import and Vite emits one chunk each.
 */
export const routeModules = {
  explore: () => import("@/pages/explore"),
  editor: () => import("@/pages/editor"),
  // Cytoscape is heavy; the graph page and its canvas stay out of the main chunk.
  graph: () => import("@/pages/graph"),
  inbox: () => import("@/pages/inbox"),
  projects: () => import("@/pages/projects"),
  proposal: () => import("@/pages/proposal"),
  recommend: () => import("@/pages/recommend"),
  skills: () => import("@/pages/skills"),
  settings: () => import("@/pages/settings"),
};

type RouteModuleKey = keyof typeof routeModules;

/** Sidebar destination -> the lazy module that paints it. Home ships in the main chunk. */
const ROUTE_FOR_PATH: Partial<Record<string, RouteModuleKey>> = {
  "/explore": "explore",
  "/projects": "projects",
  "/graph": "graph",
  "/inbox": "inbox",
  "/recommend": "recommend",
  "/skills": "skills",
  "/settings": "settings",
};

function prefetch(key: readonly unknown[], queryFn: () => Promise<unknown>, queryClient: QueryClient): void {
  void queryClient.prefetchQuery({ queryKey: key, queryFn }).catch(() => undefined);
}

/**
 * The one query each page blocks on, warmed so the first paint has data instead of a
 * skeleton. Extra entries are cheap, shared queries the page also needs on first paint.
 */
const ROUTE_QUERIES: Record<string, (queryClient: QueryClient) => void> = {
  "/": (queryClient) => prefetch(queryKeys.stats, getStats, queryClient),
  "/explore": (queryClient) => {
    prefetch(queryKeys.notes({}), () => getNotes({}), queryClient);
    prefetch(queryKeys.layers, getLayers, queryClient);
  },
  "/projects": (queryClient) => prefetch(queryKeys.notes({}), () => getNotes({}), queryClient),
  "/graph": (queryClient) => prefetch(queryKeys.graph(false), () => getGraph(false), queryClient),
  "/inbox": (queryClient) => {
    prefetch(queryKeys.inbox, getInbox, queryClient);
    prefetch(queryKeys.stats, getStats, queryClient);
  },
  "/recommend": (queryClient) => {
    prefetch(queryKeys.layers, getLayers, queryClient);
    prefetch(queryKeys.stats, getStats, queryClient);
  },
  "/skills": (queryClient) => prefetch(queryKeys.skills, getSkills, queryClient),
  "/settings": (queryClient) => {
    prefetch(queryKeys.config, getConfig, queryClient);
    prefetch(queryKeys.connectStatus, getConnectStatus, queryClient);
  },
};

/** Paths already warmed this session: hover and focus only ever pay for the first time. */
const warmed = new Set<string>();

/**
 * Warm one sidebar destination: its lazy chunk plus its first-paint queries. Called on
 * hover and keyboard focus, so a click lands on a route whose code and data are already
 * in memory. A no-op after the first call for that path.
 */
export function prefetchRoute(to: string, queryClient: QueryClient): void {
  if (warmed.has(to)) return;
  warmed.add(to);
  const module = ROUTE_FOR_PATH[to];
  if (module) void routeModules[module]().catch(() => undefined);
  ROUTE_QUERIES[to]?.(queryClient);
}
