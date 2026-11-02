import type { AgentRunDoneEvent, AgentRunEvent, AgentRunRequest } from "@marcozvd/basics-core";
import { useSyncExternalStore } from "react";
import { ApiRequestError, getInbox, getNotes, cancelAgentRun as requestCancel, startAgentRun as requestStart } from "./api";
import { getRecommendState, updateAgent } from "./recommend-store";

/** Life of one headless run as the panel shows it. `cancelled` is its own state, not an error. */
export type AgentRunStatus = "idle" | "starting" | "running" | "done" | "error" | "cancelled" | "interrupted";

export interface AgentRunState {
  status: AgentRunStatus;
  runId: string | null;
  /** Assistant text streamed so far; the final `text` replaces it when the run ends. */
  text: string;
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;
}

/** Whether a run is producing output right now. */
export function isAgentRunActive(status: AgentRunStatus): boolean {
  return status === "starting" || status === "running";
}

/** Whether the run is over (nothing more will stream). */
export function isAgentRunSettled(status: AgentRunStatus): boolean {
  return status === "done" || status === "error" || status === "cancelled" || status === "interrupted";
}

export interface AgentRunController {
  state: AgentRunState;
  start: (body: AgentRunRequest) => Promise<void>;
  cancel: () => void;
  reset: () => void;
}

const IDLE: AgentRunState = { status: "idle", runId: null, text: "", error: null, startedAt: null, endedAt: null };

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The panel's last run, restored from `recommend-store`: a finished answer survives a page reload,
 * while a run that was streaming keeps its text and comes back as `interrupted` (Retry re-runs it).
 */
function hydrate(): AgentRunState {
  const { agent } = getRecommendState();
  if (agent.status === "idle" || agent.status === "running") return IDLE;
  const endedAt = Date.now();
  return {
    status: agent.status,
    // Only an interrupted run still owns a server run to cancel; a settled one has nothing left.
    runId: agent.status === "interrupted" ? agent.runId : null,
    text: agent.text,
    error: agent.error,
    startedAt: agent.elapsed > 0 ? endedAt - agent.elapsed : null,
    endedAt,
  };
}

/**
 * One agent run lives outside React so it keeps streaming while the user is on another page.
 * `startAgentRun` follows `POST /api/agents/run` on the shared SSE channel; the final `text` of the
 * done event is authoritative, so a dropped chunk never loses the answer. Every settled run is
 * mirrored into `recommend-store` (sessionStorage), which is also where a reload restores it from.
 */
let state: AgentRunState = hydrate();
let source: EventSource | null = null;
let runId: string | null = null;
/** Bumped by start/reset so a slow persistence step from an older run cannot overwrite a newer one. */
let generation = 0;
const listeners = new Set<() => void>();

// A reload cannot resume a run, so cancel the one it abandoned instead of leaving a CLI alive.
if (state.status === "interrupted" && state.runId) {
  const abandoned = state.runId;
  void requestCancel(abandoned).catch(() => undefined);
}

function emit(): void {
  for (const listener of listeners) listener();
}

function setState(next: AgentRunState | ((prev: AgentRunState) => AgentRunState)): void {
  state = typeof next === "function" ? next(state) : next;
  emit();
}

function closeSource(): void {
  source?.close();
  source = null;
}

/** Mentioned tech ids, the proposals this run added and its duration, written once it settles. */
async function persistSettled(
  gen: number,
  status: "done" | "error" | "cancelled",
  text: string,
  error: string | null,
  elapsed: number,
  inboxBefore: Promise<Set<string>>,
): Promise<void> {
  let cited: string[] = [];
  try {
    const notes = await getNotes();
    cited = mentionedTechIds(text, new Set(notes.map((note) => note.id)));
  } catch {
    // The answer is already persisted; the panel can still derive citations from it.
  }
  let proposed: string[] = [];
  try {
    const [inbox, before] = await Promise.all([getInbox(), inboxBefore]);
    proposed = inbox.filter((proposal) => !before.has(proposal.id)).map((proposal) => proposal.id);
  } catch {
    // The proposals line is best-effort.
  }
  if (gen !== generation) return;
  updateAgent({ status, text, error, elapsed, cited, proposed, runId: null });
}

/** Attempts (and delay) to win the single run slot back from a run a reload abandoned. */
const CONFLICT_ATTEMPTS = 20;
const CONFLICT_RETRY_MS = 200;

/**
 * Start the run on the server. The server runs one agent at a time, so a run abandoned by a reload
 * still holds the slot: cancel it first, then wait (briefly) for it to let go instead of failing.
 */
async function requestRun(body: AgentRunRequest, stale: string | null): Promise<string> {
  if (stale) await requestCancel(stale).catch(() => undefined);
  for (let attempt = 0; ; attempt += 1) {
    try {
      return (await requestStart(body)).runId;
    } catch (error) {
      const conflict = error instanceof ApiRequestError && error.status === 409;
      if (!stale || !conflict || attempt >= CONFLICT_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, CONFLICT_RETRY_MS));
    }
  }
}

/** Start one run; the previous one (if any) is dropped and its source closed. */
async function start(body: AgentRunRequest): Promise<void> {
  const gen = ++generation;
  const stale = state.runId;
  closeSource();
  runId = null;
  const startedAt = Date.now();
  setState({ status: "starting", runId: null, text: "", error: null, startedAt, endedAt: null });
  updateAgent({
    open: true,
    status: "running",
    agent: body.agent,
    model: body.model ?? "",
    runId: null,
    prompt: body.description,
    text: "",
    cited: [],
    proposed: [],
    elapsed: 0,
    error: null,
  });

  // Which proposals existed before this run, so the ones it adds can be reported when it ends.
  const inboxBefore = getInbox()
    .then((list) => new Set(list.map((proposal) => proposal.id)))
    .catch(() => new Set<string>());

  const live = typeof EventSource !== "undefined" ? new EventSource("/api/events") : null;
  source = live;
  const buffered: { type: "chunk" | "done"; event: AgentRunEvent | AgentRunDoneEvent }[] = [];

  const applyChunk = (event: AgentRunEvent) => {
    if (gen !== generation) return;
    setState((prev) => ({ ...prev, text: prev.text + event.chunk }));
  };
  const applyDone = (event: AgentRunDoneEvent) => {
    if (gen !== generation) return;
    closeSource();
    const endedAt = Date.now();
    const text = event.text || state.text;
    const elapsed = state.startedAt ? endedAt - state.startedAt : 0;
    const cancelled = !event.ok && event.error === "cancelled";
    const status = cancelled ? "cancelled" : event.ok ? "done" : "error";
    setState((prev) => ({
      status,
      runId,
      text,
      error: event.error ?? null,
      startedAt: prev.startedAt,
      endedAt,
    }));
    void persistSettled(gen, status, text, event.error ?? null, elapsed, inboxBefore);
  };
  const onEvent = (type: "chunk" | "done") => (raw: Event) => {
    let event: AgentRunEvent | AgentRunDoneEvent;
    try {
      event = JSON.parse((raw as MessageEvent).data) as AgentRunEvent | AgentRunDoneEvent;
    } catch {
      return;
    }
    if (!runId) {
      buffered.push({ type, event });
      return;
    }
    if (event.runId !== runId) return;
    if (type === "chunk") applyChunk(event as AgentRunEvent);
    else applyDone(event as AgentRunDoneEvent);
  };
  live?.addEventListener("agent-run", onEvent("chunk"));
  live?.addEventListener("agent-run-done", onEvent("done"));

  try {
    const started = await requestRun(body, stale);
    if (gen !== generation) return;
    runId = started;
    setState((prev) => ({ ...prev, status: "running", runId: started }));
    updateAgent({ runId: started }, { flush: true });
    for (const item of buffered) {
      if (item.event.runId !== runId) continue;
      if (item.type === "chunk") applyChunk(item.event as AgentRunEvent);
      else applyDone(item.event as AgentRunDoneEvent);
    }
  } catch (error) {
    if (gen !== generation) return;
    closeSource();
    const endedAt = Date.now();
    const message = messageOf(error);
    setState({ status: "error", runId: null, text: "", error: message, startedAt: null, endedAt });
    updateAgent({ status: "error", text: "", error: message, elapsed: 0, cited: [], proposed: [], runId: null });
  }
}

/** Ask the server to stop the live run; its `cancelled` done event settles the panel. */
function cancel(): void {
  // A settled run has nothing left to cancel: the id is only kept for the panel's display.
  if (runId && isAgentRunActive(state.status)) void requestCancel(runId).catch(() => undefined);
}

/** Drop the run and its answer (Recommend's Clear); an active run is cancelled server-side. */
export function resetAgentRun(): void {
  generation += 1;
  cancel();
  closeSource();
  runId = null;
  setState(IDLE);
  updateAgent({ status: "idle", prompt: "", text: "", cited: [], proposed: [], elapsed: 0, error: null, runId: null });
}

/** Panel-facing controller over the shared run. */
export function useAgentRun(): AgentRunController {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  return { state: current, start, cancel, reset: resetAgentRun };
}

/** Status alone, so shell chrome (Dock indicator, toast) does not re-render on every chunk. */
export function useAgentRunStatus(): AgentRunStatus {
  return useSyncExternalStore(subscribe, statusSnapshot, statusSnapshot);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): AgentRunState {
  return state;
}

function statusSnapshot(): AgentRunStatus {
  return state.status;
}

const WIKILINK = /\[\[([^\]|#\n]+)(?:\|[^\]\n]+)?\]\]/g;

/**
 * Tech ids an agent answer mentions with `[[id]]`, in first-appearance order, restricted to notes
 * that exist in the vault (`known`). Ids the answer proposes (not in the vault yet) are left out.
 */
export function mentionedTechIds(text: string, known: ReadonlySet<string>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const match of text.matchAll(WIKILINK)) {
    const id = match[1].trim();
    if (!id || seen.has(id) || !known.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** `12s`, `1m 05s` — short enough for a status line. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, "0")}s` : `${seconds}s`;
}
