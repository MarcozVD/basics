/**
 * Main-thread side of the off-thread flat-graph layout.
 *
 * The heavy part of a flat graph is fcose: 14 s of number crunching on a big vault, and it
 * used to block clicks, hovers and paint for that long. It now runs in a module worker
 * (`graph-layout.worker.ts`, its own lazy chunk) that posts a quick coarse pass first and
 * then the full one, so the picture can settle in two steps while the page stays usable.
 *
 * Only one request runs at a time. A new request (or a cancel) terminates the worker, which
 * is also how the caller stops work it no longer needs; the next request lazily starts a
 * fresh one. When the worker cannot be created or fails, `done` resolves `unavailable` and
 * the caller runs its synchronous fallback, so the graph always settles one way or another.
 */

export interface GraphLayoutPosition {
  x: number;
  y: number;
}

export interface GraphLayoutNode {
  id: string;
  /** Measured on the main thread: the dot plus its label box, as the rendered graph has it. */
  width: number;
  height: number;
}

export interface GraphLayoutEdge {
  source: string;
  target: string;
}

export interface GraphLayoutStageOptions {
  stage: "coarse" | "final";
  quality: "draft" | "default" | "proof";
  numIter: number;
  nodeRepulsion: number;
  idealEdgeLength: number;
  nodeSeparation: number;
  gravity: number;
}

export interface GraphLayoutRequest {
  id: number;
  nodes: GraphLayoutNode[];
  edges: GraphLayoutEdge[];
  /** Where to start from; `null` lets fcose seed itself (from the shared LCG). */
  positions: Record<string, GraphLayoutPosition> | null;
  randomize: boolean;
  /** The quick pass, or `null` to run the final one only (reduced motion). */
  coarse: GraphLayoutStageOptions | null;
  final: GraphLayoutStageOptions;
}

export interface GraphLayoutResult {
  id: number;
  stage: "coarse" | "final" | "error";
  positions: Record<string, GraphLayoutPosition>;
  /** Time the worker spent in this stage. */
  ms: number;
  error?: string;
}

interface ActiveRun {
  id: number;
  resolve: (outcome: GraphLayoutOutcome) => void;
  onStage: (result: GraphLayoutResult) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** `worker`: settled off-thread. `unavailable`: the caller must run the synchronous layout. */
export type GraphLayoutOutcome = "worker" | "unavailable" | "cancelled";

export interface GraphLayoutRun {
  /** Resolves once the off-thread work is done, failed, or was cancelled. */
  done: Promise<GraphLayoutOutcome>;
  cancel: () => void;
}

/** A worker that has not posted anything for this long is treated as dead. */
const LAYOUT_TIMEOUT = 120_000;

let worker: Worker | null = null;
let active: ActiveRun | null = null;
let nextId = 1;

function createWorker(): Worker | null {
  if (typeof Worker === "undefined") return null;
  try {
    return new Worker(new URL("./graph-layout.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

function shutdown(): void {
  worker?.terminate();
  worker = null;
}

function finish(outcome: GraphLayoutOutcome): void {
  const run = active;
  if (!run) return;
  active = null;
  clearTimeout(run.timer);
  run.resolve(outcome);
}

function fail(): void {
  shutdown();
  finish("unavailable");
}

function ensureWorker(): Worker | null {
  if (worker) return worker;
  const created = createWorker();
  if (!created) return null;
  created.onmessage = (event: MessageEvent<GraphLayoutResult>) => {
    const result = event.data;
    const run = active;
    if (!run || result.id !== run.id) return;
    if (result.stage === "error") {
      fail();
      return;
    }
    try {
      run.onStage(result);
    } catch {
      // Applying a stage should not be able to hang the layout: fall back to the main thread.
      fail();
      return;
    }
    if (result.stage === "coarse") return;
    clearTimeout(run.timer);
    finish("worker");
  };
  created.onerror = () => fail();
  created.onmessageerror = () => fail();
  worker = created;
  return worker;
}

/**
 * Runs the layout off the main thread. `onStage` fires for the coarse pass and for the
 * final one; positions are graph-space and complete for every node that was sent.
 */
export function startGraphLayout(request: Omit<GraphLayoutRequest, "id">, onStage: (result: GraphLayoutResult) => void): GraphLayoutRun {
  // One simulation at a time: a stale run would only waste the worker.
  if (active) {
    shutdown();
    finish("cancelled");
  }
  const id = nextId++;
  const target = ensureWorker();
  if (!target) {
    return { done: Promise.resolve("unavailable"), cancel: () => {} };
  }
  const done = new Promise<GraphLayoutOutcome>((resolve) => {
    active = {
      id,
      resolve,
      onStage,
      timer: setTimeout(() => fail(), LAYOUT_TIMEOUT),
    };
  });
  try {
    target.postMessage({ ...request, id } satisfies GraphLayoutRequest);
  } catch {
    fail();
    return { done: Promise.resolve("unavailable"), cancel: () => {} };
  }
  return {
    done,
    cancel: () => {
      if (active?.id !== id) return;
      // Terminating is the only way to stop fcose mid-flight; the next request starts fresh.
      shutdown();
      finish("cancelled");
    },
  };
}
