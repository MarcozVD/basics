import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  type ActivityFilter,
  getActivity,
  getAgents,
  getConfig,
  getConnectStatus,
  getEmbeddings,
  getGraph,
  getHealth,
  getInbox,
  getLayers,
  getNote,
  getNotes,
  getPacks,
  getProposal,
  getSkills,
  getStats,
  type NoteFilter,
  search,
} from "./api";

export const queryKeys = {
  health: ["health"] as const,
  layers: ["layers"] as const,
  notes: (filter: NoteFilter) => ["notes", filter] as const,
  search: (q: string, filter: NoteFilter) => ["search", q, filter] as const,
  note: (id: string) => ["note", id] as const,
  inbox: ["inbox"] as const,
  proposal: (id: string) => ["proposal", id] as const,
  packs: ["packs"] as const,
  config: ["config"] as const,
  embeddings: ["embeddings"] as const,
  activity: (filter: ActivityFilter) => ["activity", filter] as const,
  stats: ["stats"] as const,
  graph: (broken: boolean) => ["graph", broken] as const,
  agents: ["agents"] as const,
  connectStatus: ["connect-status"] as const,
  skills: ["skills"] as const,
};

export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: getHealth });
}

export function useLayers() {
  return useQuery({ queryKey: queryKeys.layers, queryFn: getLayers });
}

export function useNotes(filter: NoteFilter = {}) {
  return useQuery({ queryKey: queryKeys.notes(filter), queryFn: () => getNotes(filter) });
}

export function useSearch(q: string, filter: NoteFilter = {}) {
  return useQuery({ queryKey: queryKeys.search(q, filter), queryFn: () => search(q, filter), enabled: q.length > 0 });
}

export function useNote(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.note(id ?? ""), queryFn: () => getNote(id ?? ""), enabled: Boolean(id) });
}

export function useInbox() {
  return useQuery({ queryKey: queryKeys.inbox, queryFn: getInbox });
}

export function useProposal(id: string | undefined) {
  return useQuery({ queryKey: queryKeys.proposal(id ?? ""), queryFn: () => getProposal(id ?? ""), enabled: Boolean(id) });
}

export function usePacks(enabled = true) {
  return useQuery({ queryKey: queryKeys.packs, queryFn: getPacks, enabled });
}

export function useConfig() {
  return useQuery({ queryKey: queryKeys.config, queryFn: getConfig });
}

export function useEmbeddings(enabled = true) {
  return useQuery({ queryKey: queryKeys.embeddings, queryFn: getEmbeddings, enabled });
}

export function useStats() {
  return useQuery({ queryKey: queryKeys.stats, queryFn: getStats });
}

export function useActivity(filter: ActivityFilter = {}) {
  return useQuery({ queryKey: queryKeys.activity(filter), queryFn: () => getActivity(filter) });
}

/**
 * Toggling broken links keeps the previous graph on screen while the other variant loads.
 *
 * The graph is expensive to fetch for a big vault and the SSE vault events already
 * invalidate it on every change, so a return to `/graph` paints the cached data first
 * and only patches a background refetch.
 */
export function useGraph(broken = false) {
  return useQuery({
    queryKey: queryKeys.graph(broken),
    queryFn: () => getGraph(broken),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });
}

export function useAgents() {
  return useQuery({ queryKey: queryKeys.agents, queryFn: getAgents });
}

/** Which coding clients exist here and whether each one points at this vault. */
export function useConnectStatus() {
  return useQuery({ queryKey: queryKeys.connectStatus, queryFn: getConnectStatus });
}

/** Skills installed in the coding agents' own folders; the server re-scans on every request. */
export function useSkills() {
  return useQuery({ queryKey: queryKeys.skills, queryFn: getSkills });
}
