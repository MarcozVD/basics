import type { ExportTarget } from "./export.js";
import type { NoteData, NoteType, ProposalMeta } from "./schema.js";

export interface NoteSummary {
  id: string;
  type: NoteType;
  title: string;
  layers: string[];
  kind?: string;
  source: string;
  updated?: string;
  tags: string[];
  /** First `use_when` entry for tech notes, else the first non-heading body line (max 120 chars). */
  excerpt?: string;
  /** Full project frontmatter for project notes, so the Projects list needs one request. */
  project?: Extract<NoteData, { type: "project" }>;
}

export interface LayerSummary {
  id: string;
  title: string;
  techs: string[];
}

export interface NoteDetail {
  id: string;
  type: NoteType;
  data: NoteData;
  body: string;
  links: string[];
  backlinks: string[];
  hash: string;
  path: string; // path relative to vault root, forward slashes
}

export interface ProposalSummary {
  id: string;
  type: NoteType;
  title: string;
  meta: ProposalMeta;
}

export interface ProposalDetail {
  id: string;
  meta: ProposalMeta;
  data: NoteData;
  body: string;
  proposedText: string;
  current: { data: NoteData; body: string; hash: string; text: string } | null;
}

export interface BrokenLink {
  from: string;
  to: string;
}

export interface VaultStats {
  counts: Record<NoteType, number>;
  total: number;
  inbox: number;
  brokenLinks: BrokenLink[];
  orphans: string[];
  /** Six most recently updated notes. */
  recent: NoteSummary[];
}

export interface SaveNoteRequest {
  data: NoteData;
  body: string;
  expectedHash?: string;
}

export interface CreateNoteRequest {
  id: string;
  data: NoteData;
  body: string;
}

export interface ApproveRequest {
  data?: NoteData;
  body?: string;
}

export interface PackInstallRequest {
  lang?: "en" | "es";
}

export interface PackInstallResult {
  installed: string[];
  skipped: string[];
  /** Per-pack note ids, in install order. */
  byPack: Record<string, { installed: string[]; skipped: string[] }>;
}

export interface PackUpdateResult {
  proposed: string[];
  unchanged: string[];
  /** Installed notes the pack no longer owns (their source belongs to something else). */
  skipped: string[];
  upToDate: boolean;
}

export interface PackAddRequest {
  repo: string;
  ref?: string;
  path?: string;
  lang?: "en" | "es";
}

export interface PackAddResult {
  name: string;
  version: string;
  repo: string;
  ref: string;
  proposed_new: string[];
  proposed_changed: string[];
  unchanged: string[];
  skipped: string[];
  /** Invalid notes skipped and reported (file + reason). */
  invalid: { file: string; reason: string }[];
  upToDate?: boolean;
}

export interface ApproveAllRequest {
  pack: string;
  version?: string;
}

export interface ApproveAllResponse {
  approved: string[];
}

export interface RecommendRequest {
  description: string;
  layers?: string[];
  perLayer?: number;
}

export interface ContextRequest {
  techIds: string[];
}

export interface ContextResponse {
  markdown: string;
}

export interface ExportRequest {
  stack: string[];
  targets?: ExportTarget[];
  /** Current file contents keyed by relative path, merged into agent files. */
  existing?: Record<string, string>;
}

export interface ApiError {
  error: "conflict" | "invalid" | "not_found" | "vault_not_found" | "exists" | "forbidden" | "internal";
  message: string;
  actualHash?: string;
  issues?: unknown;
}

export type VaultEvent = { type: "vault"; paths: string[] } | { type: "activity" } | { type: "embeddings"; done: number; total: number };

export type GraphNodeType = NoteType | "missing";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  title: string;
  layers: string[];
  /** Number of distinct neighbours among the returned edges. */
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: "link" | "broken";
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
