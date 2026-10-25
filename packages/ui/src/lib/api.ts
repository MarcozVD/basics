import type {
  ActivityEvent,
  ApiError,
  ApproveAllRequest,
  ApproveAllResponse,
  ApproveRequest,
  ContextResponse,
  CreateNoteRequest,
  EmbeddingsEnableResponse,
  EmbeddingsStatus,
  ExportFile,
  ExportTarget,
  GraphData,
  LayerSummary,
  NoteDetail,
  NoteSummary,
  NoteType,
  PackAddResult,
  PackInfo,
  PackInstallResult,
  ProposalDetail,
  ProposalSummary,
  Recommendation,
  RecommendRequest,
  RejectAllResponse,
  SaveNoteRequest,
  SearchHit,
  VaultStats,
} from "@marcozvd/basics-core";

export type Language = "en" | "es";

export interface AppConfig {
  language: Language;
}

export interface Health {
  ok: boolean;
  version: string;
  vault: string;
}

export interface NoteFilter {
  type?: NoteType;
  layer?: string;
}

export interface ActivityFilter {
  limit?: number;
  noteId?: string;
  agent?: string;
}

export class ApiRequestError extends Error {
  status: number;
  body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.message);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as Partial<ApiError>;
    if (typeof body.error === "string" && typeof body.message === "string") return body as ApiError;
  } catch {
    // Non-JSON error body: fall through to the generic message.
  }
  return { error: "internal", message: `Request failed with status ${res.status}` };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) throw new ApiRequestError(res.status, await readError(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function withQuery(path: string, params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const qs = query.toString();
  return qs ? `${path}?${qs}` : path;
}

const notePath = (id: string) => `/api/notes/${encodeURIComponent(id)}`;
const proposalPath = (id: string) => `/api/inbox/${encodeURIComponent(id)}`;

export function getGraph(broken = false): Promise<GraphData> {
  return request<GraphData>(withQuery("/api/graph", { broken: broken ? "1" : undefined }));
}

export function getHealth(): Promise<Health> {
  return request<Health>("/api/health");
}

export function getLayers(): Promise<LayerSummary[]> {
  return request<LayerSummary[]>("/api/layers");
}

export function getNotes(filter: NoteFilter = {}): Promise<NoteSummary[]> {
  return request<NoteSummary[]>(withQuery("/api/notes", { type: filter.type, layer: filter.layer }));
}

export function getNote(id: string): Promise<NoteDetail> {
  return request<NoteDetail>(notePath(id));
}

export function createNote(body: CreateNoteRequest): Promise<NoteDetail> {
  return request<NoteDetail>("/api/notes", { method: "POST", body: JSON.stringify(body) });
}

export function saveNote(id: string, body: SaveNoteRequest): Promise<NoteDetail> {
  return request<NoteDetail>(notePath(id), { method: "PUT", body: JSON.stringify(body) });
}

export function deleteNote(id: string, expectedHash?: string): Promise<void> {
  return request<void>(withQuery(notePath(id), { expectedHash }), { method: "DELETE" });
}

export function search(q: string, filter: NoteFilter = {}): Promise<SearchHit[]> {
  return request<SearchHit[]>(withQuery("/api/search", { q, type: filter.type, layer: filter.layer }));
}

export function recommend(body: RecommendRequest): Promise<Recommendation> {
  return request<Recommendation>("/api/recommend", { method: "POST", body: JSON.stringify(body) });
}

export function getEmbeddings(): Promise<EmbeddingsStatus> {
  return request<EmbeddingsStatus>("/api/embeddings");
}

/** Same as `basics embeddings enable`: download the runtime/model once and sync the index. */
export function enableEmbeddings(): Promise<EmbeddingsEnableResponse> {
  return request<EmbeddingsEnableResponse>("/api/embeddings/enable", { method: "POST" });
}

export function getContext(techIds: string[]): Promise<ContextResponse> {
  return request<ContextResponse>("/api/context", { method: "POST", body: JSON.stringify({ techIds }) });
}

export function exportStack(stack: string[], targets: ExportTarget[], existing?: Record<string, string>): Promise<ExportFile[]> {
  return request<ExportFile[]>("/api/export", { method: "POST", body: JSON.stringify({ stack, targets, existing }) });
}

export function getPacks(): Promise<PackInfo[]> {
  return request<PackInfo[]>("/api/packs");
}

export function installPack(name: string, lang: Language): Promise<PackInstallResult> {
  return request<PackInstallResult>(`/api/packs/${encodeURIComponent(name)}/install`, {
    method: "POST",
    body: JSON.stringify({ lang }),
  });
}

export function addPack(body: { repo: string; ref?: string; path?: string; lang?: Language }): Promise<PackAddResult> {
  return request<PackAddResult>("/api/packs/add", { method: "POST", body: JSON.stringify(body) });
}

export function getInbox(): Promise<ProposalSummary[]> {
  return request<ProposalSummary[]>("/api/inbox");
}

export function getProposal(id: string): Promise<ProposalDetail> {
  return request<ProposalDetail>(proposalPath(id));
}

export function approveProposal(id: string, override?: ApproveRequest): Promise<NoteDetail> {
  return request<NoteDetail>(`${proposalPath(id)}/approve`, { method: "POST", body: JSON.stringify(override ?? {}) });
}

export function rejectProposal(id: string): Promise<void> {
  return request<void>(`${proposalPath(id)}/reject`, { method: "POST" });
}

export function approveAllProposals(body: ApproveAllRequest): Promise<ApproveAllResponse> {
  return request<ApproveAllResponse>("/api/inbox/approve-all", { method: "POST", body: JSON.stringify(body) });
}

export function rejectAllProposals(body: ApproveAllRequest): Promise<RejectAllResponse> {
  return request<RejectAllResponse>("/api/inbox/reject-all", { method: "POST", body: JSON.stringify(body) });
}

export function getConfig(): Promise<AppConfig> {
  return request<AppConfig>("/api/config");
}

export function getStats(): Promise<VaultStats> {
  return request<VaultStats>("/api/stats");
}

export function getActivity(filter: ActivityFilter = {}): Promise<ActivityEvent[]> {
  return request<ActivityEvent[]>(
    withQuery("/api/activity", {
      limit: filter.limit?.toString(),
      note: filter.noteId,
      agent: filter.agent,
    }),
  );
}

export function setConfig(body: AppConfig): Promise<AppConfig> {
  return request<AppConfig>("/api/config", { method: "PUT", body: JSON.stringify(body) });
}
