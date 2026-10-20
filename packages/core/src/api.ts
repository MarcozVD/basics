import type { NoteData, NoteType, ProposalMeta } from "./schema.js";

export interface NoteSummary {
  id: string;
  type: NoteType;
  title: string;
  layers: string[];
  kind?: string;
  source: string;
  updated?: string;
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

export interface ApiError {
  error: "conflict" | "invalid" | "not_found" | "vault_not_found" | "exists" | "forbidden" | "internal";
  message: string;
  actualHash?: string;
  issues?: unknown;
}

export type VaultEvent = { type: "vault"; paths: string[] } | { type: "activity" };
