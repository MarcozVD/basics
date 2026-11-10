import type {
  ActivityEvent,
  AgentRunRequest,
  AgentRunStartResponse,
  AgentsResponse,
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

/** Detected coding-agent CLIs on this computer, their models and Basics registration state. */
export function getAgents(): Promise<AgentsResponse> {
  return request<AgentsResponse>("/api/agents");
}

/** Start one headless agent run; output arrives over `/api/events` as `agent-run` / `agent-run-done`. */
export function startAgentRun(body: AgentRunRequest): Promise<AgentRunStartResponse> {
  return request<AgentRunStartResponse>("/api/agents/run", { method: "POST", body: JSON.stringify(body) });
}

export function cancelAgentRun(runId: string): Promise<void> {
  return request<void>(`/api/agents/run/${encodeURIComponent(runId)}/cancel`, { method: "POST" });
}

export function getEmbeddings(): Promise<EmbeddingsStatus> {
  return request<EmbeddingsStatus>("/api/embeddings");
}

/** Same as `basics embeddings enable`: download the runtime/model once and sync the index. */
export function enableEmbeddings(): Promise<EmbeddingsEnableResponse> {
  return request<EmbeddingsEnableResponse>("/api/embeddings/enable", { method: "POST" });
}

/** Same as `basics embeddings disable`: stop using the model, keep the downloaded files. */
export function disableEmbeddings(): Promise<{ enabled: false }> {
  return request<{ enabled: false }>("/api/embeddings/disable", { method: "POST", body: "{}" });
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

/** Coding clients `basics connect` can register the MCP server with. */
export type ConnectClientId =
  | "claude-code"
  | "opencode"
  | "codex"
  | "cursor"
  | "claude-desktop"
  | "oh-my-pi"
  | "gemini-cli"
  | "qwen-code"
  | "kimi-cli"
  | "goose"
  | "amp";

export interface ConnectSkillEntry {
  path: string;
  result: "copied" | "unchanged" | "dry-run" | "removed" | "absent" | "error";
  message?: string;
  diff?: string;
}

export interface ConnectEntry {
  client: ConnectClientId;
  detected: boolean;
  /** Config file (or command) that was read or written. */
  target: string;
  change: string;
  result: "registered" | "updated" | "unchanged" | "skipped" | "dry-run" | "manual" | "error" | "removed" | "absent";
  message?: string;
  diff?: string;
  skill?: ConnectSkillEntry;
}

export interface ConnectResult {
  vault: string;
  transport: "stdio" | "http";
  url?: string;
  command: string[];
  entries: ConnectEntry[];
  skillError?: string;
}

/** What a client has today: installed on this machine, pointed at this vault, skill copied in. */
export interface ConnectStatusEntry {
  client: ConnectClientId;
  detected: boolean;
  connected: boolean;
  transport?: "stdio" | "http";
  /** `null` when the client has no skill support. */
  skill: boolean | null;
  configPath: string;
}

export interface ConnectStatus {
  vault: string;
  clients: ConnectStatusEntry[];
  snippets: { json: string; toml: string; http: string; command: string };
}

export interface DisconnectResult {
  entries: ConnectEntry[];
}

export function getConnectStatus(): Promise<ConnectStatus> {
  return request<ConnectStatus>("/api/connect/status");
}

/** Register the Basics MCP server with the given clients; `dryRun` returns the diff only. */
export function connectClients(body: { clients: ConnectClientId[]; dryRun?: boolean }): Promise<ConnectResult> {
  return request<ConnectResult>("/api/connect", { method: "POST", body: JSON.stringify(body) });
}

/** Remove the Basics MCP entry (and skill) from the given clients, keeping everything else. */
export function disconnectClients(body: { clients: ConnectClientId[] }): Promise<DisconnectResult> {
  return request<DisconnectResult>("/api/disconnect", { method: "POST", body: JSON.stringify(body) });
}

/** The fixed area set, in the order the page and the CLI show them. Mirrors `SKILL_AREAS`. */
export const SKILL_AREAS = ["frontend", "backend", "security", "testing", "devops", "data", "ai", "docs", "workflow", "other"] as const;
export type SkillArea = (typeof SKILL_AREAS)[number];

export const SKILL_AGENTS = ["claude-code", "opencode", "codex", "shared"] as const;
export type SkillAgentId = (typeof SKILL_AGENTS)[number];

export type SkillAreaSource = "frontmatter" | "keywords" | "override" | "none";

/** One installed skill, as scanned from the agent folders (`GET /api/skills`). */
export interface SkillEntry {
  /** Stable, URL-safe id used by the area override. */
  key: string;
  name: string;
  description: string;
  summary: string;
  area: SkillArea;
  areaSource: SkillAreaSource;
  agents: SkillAgentId[];
  plugin?: string;
  /** `~/`-shortened path of the `SKILL.md`. */
  path: string;
  version?: string;
  error?: string;
}

export interface SkillAgentInfo {
  id: SkillAgentId;
  name: string;
  detected: boolean;
  dirs: string[];
}

export interface SkillsResponse {
  agents: SkillAgentInfo[];
  skills: SkillEntry[];
}

/** Every skill installed for this user; read-only, a broken file comes back as a row with `error`. */
export function getSkills(): Promise<SkillsResponse> {
  return request<SkillsResponse>("/api/skills");
}

const skillAreaPath = (key: string) => `/api/skills/${encodeURIComponent(key)}/area`;

/** Save the owner's area for one skill in the Basics config; the skill file is never touched. */
export function putSkillArea(key: string, area: SkillArea): Promise<{ key: string; area: SkillArea }> {
  return request<{ key: string; area: SkillArea }>(skillAreaPath(key), { method: "PUT", body: JSON.stringify({ area }) });
}

/** Forget the override and go back to the detected area. */
export function deleteSkillArea(key: string): Promise<{ key: string; area: null }> {
  return request<{ key: string; area: null }>(skillAreaPath(key), { method: "DELETE" });
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
