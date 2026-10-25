import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  type ActivityFilter,
  getActivity,
  getAgents,
  getConfig,
  getEmbeddings,
  getGraph,
  getHealth,
  getInbox,
  getLayers,
  getNote,
  getNotes,
  getPacks,
  getProposal,
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

/** Toggling broken links keeps the previous graph on screen while the other variant loads. */
export function useGraph(broken = false) {
  return useQuery({ queryKey: queryKeys.graph(broken), queryFn: () => getGraph(broken), placeholderData: keepPreviousData });
}

export function useAgents() {
  return useQuery({ queryKey: queryKeys.agents, queryFn: getAgents });
}
