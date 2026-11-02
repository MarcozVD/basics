import type { Recommendation } from "@marcozvd/basics-core";
import { useSyncExternalStore } from "react";

const KEY = "basics:recommend";
/** Keep the stored session small enough for sessionStorage even with a big result. */
const MAX_CHARS = 500_000;
const DEFAULT_PER_LAYER = 3;

export interface RecommendState {
  description: string;
  selectedLayers: string[] | null;
  perLayer: number;
  selected: string[];
  recommendation: Recommendation | null;
  exportTab: string;
  /** Profile id the current selection came from (via "Use this profile"), for prefills. */
  fromProfile: string | null;
  /** "Ask an agent" panel and its last run, kept so leaving the page never loses the answer. */
  agent: RecommendAgentState;
}

/** Persisted agent panel + run, mirrored by `lib/agent-run.ts`. */
export interface RecommendAgentState {
  /** Whether the panel is open on Recommend. */
  open: boolean;
  /** `running` is only ever stored while a run is live; a reload turns it into `interrupted`. */
  status: "idle" | "running" | "done" | "error" | "cancelled" | "interrupted";
  /** Chosen agent CLI id and model (empty when the CLI has a free-text model field). */
  agent: string | null;
  model: string;
  /** Server run id while one is unsettled, so a reload can cancel the run it abandoned. */
  runId: string | null;
  /** Description the last run was started with. */
  prompt: string;
  /** Final answer text; the live stream is never written here. */
  text: string;
  /** Tech notes the answer cited with `[[id]]`, in first-appearance order. */
  cited: string[];
  /** Proposal ids the run added to the Inbox. */
  proposed: string[];
  /** Wall-clock duration of the run in ms; 0 before it starts. */
  elapsed: number;
  error: string | null;
}

export const EMPTY_AGENT: RecommendAgentState = {
  open: false,
  status: "idle",
  agent: null,
  model: "",
  runId: null,
  prompt: "",
  text: "",
  cited: [],
  proposed: [],
  elapsed: 0,
  error: null,
};

function initialAgent(): RecommendAgentState {
  return { ...EMPTY_AGENT, cited: [], proposed: [] };
}

function initialState(): RecommendState {
  return {
    description: "",
    selectedLayers: null,
    perLayer: DEFAULT_PER_LAYER,
    selected: [],
    recommendation: null,
    exportTab: "stack",
    fromProfile: null,
    agent: initialAgent(),
  };
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((item): item is string => typeof item === "string");
}

const AGENT_STATUS = ["idle", "running", "done", "error", "cancelled", "interrupted"] as const;
type AgentStatus = (typeof AGENT_STATUS)[number];

/** Restore the persisted agent panel; a `running` run cannot survive a reload, so it is interrupted. */
function readAgent(value: unknown): RecommendAgentState {
  const parsed = value && typeof value === "object" ? (value as Partial<RecommendAgentState>) : {};
  const status =
    typeof parsed.status === "string" && (AGENT_STATUS as readonly string[]).includes(parsed.status)
      ? (parsed.status as AgentStatus)
      : "idle";
  const elapsed = parsed.elapsed;
  return {
    open: parsed.open === true,
    status: status === "running" ? "interrupted" : status,
    agent: typeof parsed.agent === "string" ? parsed.agent : null,
    model: typeof parsed.model === "string" ? parsed.model : "",
    runId: typeof parsed.runId === "string" ? parsed.runId : null,
    prompt: typeof parsed.prompt === "string" ? parsed.prompt : "",
    text: typeof parsed.text === "string" ? parsed.text : "",
    cited: stringList(parsed.cited) ?? [],
    proposed: stringList(parsed.proposed) ?? [],
    elapsed: typeof elapsed === "number" && elapsed >= 0 ? elapsed : 0,
    error: typeof parsed.error === "string" ? parsed.error : null,
  };
}

/** Restore the last session; malformed or missing data falls back to the defaults. */
function read(): RecommendState {
  try {
    const parsed = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Partial<RecommendState> | null;
    if (!parsed || typeof parsed !== "object") return initialState();
    const perLayer = parsed.perLayer;
    return {
      description: typeof parsed.description === "string" ? parsed.description : "",
      selectedLayers: stringList(parsed.selectedLayers),
      perLayer: typeof perLayer === "number" && perLayer >= 1 && perLayer <= 10 ? perLayer : DEFAULT_PER_LAYER,
      selected: stringList(parsed.selected) ?? [],
      recommendation: parsed.recommendation && typeof parsed.recommendation === "object" ? parsed.recommendation : null,
      exportTab: typeof parsed.exportTab === "string" ? parsed.exportTab : "stack",
      fromProfile: typeof parsed.fromProfile === "string" ? parsed.fromProfile : null,
      agent: readAgent(parsed.agent),
    };
  } catch {
    return initialState();
  }
}

let state = read();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;

function emit(): void {
  for (const listener of listeners) listener();
}

function save(): void {
  try {
    let payload = JSON.stringify(state);
    if (payload.length > MAX_CHARS) payload = JSON.stringify({ ...state, recommendation: null });
    // Same cap for the agent answer: keep the session restorable rather than dropping the write.
    if (payload.length > MAX_CHARS) {
      payload = JSON.stringify({ ...state, recommendation: null, agent: { ...state.agent, text: "", cited: [], proposed: [] } });
    }
    sessionStorage.setItem(KEY, payload);
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

function scheduleSave(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(save, 200);
}

export function updateRecommend(patch: Partial<RecommendState>): void {
  state = { ...state, ...patch };
  emit();
  scheduleSave();
}

/** Update one field of the agent panel/run without replacing the rest of it. */
export function updateAgent(patch: Partial<RecommendAgentState>, options?: { flush?: boolean }): void {
  state = { ...state, agent: { ...state.agent, ...patch } };
  emit();
  if (options?.flush) {
    // The run id is the only handle a reload has on the server run: store it without the debounce.
    if (timer) clearTimeout(timer);
    timer = undefined;
    save();
    return;
  }
  scheduleSave();
}

/** Current state outside React (the agent run store mirrors into it). */
export function getRecommendState(): RecommendState {
  return state;
}

/** Reset every control and result; storage is written at once so a reload stays clean. */
export function clearRecommend(): void {
  state = initialState();
  emit();
  if (timer) clearTimeout(timer);
  timer = undefined;
  save();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): RecommendState {
  return state;
}

export function useRecommendStore(): RecommendState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
