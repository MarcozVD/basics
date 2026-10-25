import type { AgentRunDoneEvent, AgentRunEvent, AgentRunRequest } from "@marcozvd/basics-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { cancelAgentRun, startAgentRun } from "./api";

/** Life of one headless run as the panel shows it. `cancelled` is its own state, not an error. */
export type AgentRunStatus = "idle" | "starting" | "running" | "done" | "error" | "cancelled";

export interface AgentRunState {
  status: AgentRunStatus;
  runId: string | null;
  /** Assistant text streamed so far; the final `text` replaces it when the run ends. */
  text: string;
  error: string | null;
  startedAt: number | null;
  endedAt: number | null;
}

/** Whether the run is over (nothing more will stream). */
export function isAgentRunSettled(status: AgentRunStatus): boolean {
  return status === "done" || status === "error" || status === "cancelled";
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
 * Runs one agent through `POST /api/agents/run` and follows its output on the shared SSE channel.
 * The EventSource opens before the request so the first streamed chunk is not missed; events that
 * arrive before the run id is known are buffered and replayed. The final `text` of the done event
 * is authoritative, so a dropped chunk never loses the answer.
 */
export function useAgentRun(): AgentRunController {
  const [state, setState] = useState<AgentRunState>(IDLE);
  const sourceRef = useRef<EventSource | null>(null);
  const runIdRef = useRef<string | null>(null);
  const disposed = useRef(false);

  const close = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  useEffect(
    () => () => {
      disposed.current = true;
      close();
    },
    [close],
  );

  const start = useCallback(
    async (body: AgentRunRequest) => {
      close();
      runIdRef.current = null;
      setState({ status: "starting", runId: null, text: "", error: null, startedAt: Date.now(), endedAt: null });

      const source = typeof EventSource !== "undefined" ? new EventSource("/api/events") : null;
      sourceRef.current = source;
      let runId: string | null = null;
      const buffered: { type: "chunk" | "done"; event: AgentRunEvent | AgentRunDoneEvent }[] = [];

      const applyChunk = (event: AgentRunEvent) => {
        setState((prev) => ({ ...prev, text: prev.text + event.chunk }));
      };
      const applyDone = (event: AgentRunDoneEvent) => {
        close();
        const cancelled = !event.ok && event.error === "cancelled";
        setState((prev) => ({
          status: cancelled ? "cancelled" : event.ok ? "done" : "error",
          runId,
          text: event.text || prev.text,
          error: event.error ?? null,
          startedAt: prev.startedAt,
          endedAt: Date.now(),
        }));
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
      const onChunk = onEvent("chunk");
      const onDone = onEvent("done");
      source?.addEventListener("agent-run", onChunk);
      source?.addEventListener("agent-run-done", onDone);

      try {
        const { runId: started } = await startAgentRun(body);
        if (disposed.current) return;
        runId = started;
        runIdRef.current = started;
        setState((prev) => ({ ...prev, status: "running", runId: started }));
        for (const item of buffered) {
          if (item.event.runId !== runId) continue;
          if (item.type === "chunk") applyChunk(item.event as AgentRunEvent);
          else applyDone(item.event as AgentRunDoneEvent);
        }
      } catch (error) {
        close();
        setState({ status: "error", runId: null, text: "", error: messageOf(error), startedAt: null, endedAt: Date.now() });
      }
    },
    [close],
  );

  const cancel = useCallback(() => {
    const id = runIdRef.current;
    if (id) void cancelAgentRun(id).catch(() => {});
  }, []);

  const reset = useCallback(() => {
    close();
    runIdRef.current = null;
    setState(IDLE);
  }, [close]);

  return { state, start, cancel, reset };
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
