import type { DownloadSize } from "./embeddings.js";
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
  pack?: string;
  version?: string;
  agent?: string;
  action?: "create" | "update";
  ids?: string[];
}

export interface ApproveAllFailure {
  id: string;
  error: string;
}

export interface ApproveAllResponse {
  approved: string[];
  failed: ApproveAllFailure[];
}

export type RejectAllRequest = ApproveAllRequest;

export interface RejectAllResponse {
  rejected: string[];
  failed: ApproveAllFailure[];
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

/** State of the opt-in embeddings runtime, model cache and vector index. */
export interface EmbeddingsStatus {
  enabled: boolean;
  runtime: boolean;
  model: string;
  indexed: number;
  stale: number;
  /** One-time download estimate for the configured model. */
  download: DownloadSize;
}

export interface EmbeddingsEnableResponse {
  enabled: true;
  model: string;
  /** Notes in the vector index after enabling. */
  indexed: number;
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
  hint?: string;
}

/** Coding agents the UI can run headless to plan a stack. */
export type AgentId = "claude" | "opencode" | "codex";

export interface AgentInfo {
  id: AgentId;
  name: string;
  /** The agent's CLI was found on PATH. */
  detected: boolean;
  /** Model ids the CLI offers; the UI also accepts free text. */
  models: string[];
  /** Whether `basics` is registered for that agent; `unknown` when its config cannot be read. */
  connected: boolean | "unknown";
}

export interface AgentsResponse {
  agents: AgentInfo[];
}

export interface AgentRunRequest {
  agent: AgentId;
  model?: string;
  description: string;
  layers?: string[];
}

export interface AgentRunStartResponse {
  runId: string;
}

export type VaultEvent =
  | { type: "vault"; paths: string[] }
  | { type: "activity" }
  | { type: "embeddings"; done: number; total: number }
  | AgentRunEvent
  | AgentRunDoneEvent;

/** Streamed output of a headless agent run. */
export interface AgentRunEvent {
  type: "agent-run";
  runId: string;
  chunk: string;
}

export interface AgentRunDoneEvent {
  type: "agent-run-done";
  runId: string;
  ok: boolean;
  text: string;
  error?: string;
}

export type GraphNodeType = NoteType | "missing";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  title: string;
  layers: string[];
  /**
   * Layer id this node belongs to for grouping: a tech's first layer, or the shared
   * layer of a practice/check's `applies_to` techs. Absent for layers, profiles,
   * projects, missing notes and practices/checks that span layers.
   */
  group?: string;
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
