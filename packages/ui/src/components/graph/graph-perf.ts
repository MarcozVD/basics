/**
 * Timings for the graph page, readable from Playwright.
 *
 * Everything here is inert unless the build is a dev build or the Playwright probe
 * sets `window.__BASICS_E2E__` before the page loads (same gate as `__basicsCy`), so a
 * normal build keeps the same code path and pays only a couple of `performance.now()`.
 */

export interface GraphPerfMount {
  id: number;
  mode: "full" | "local";
  nodes: number;
  edges: number;
  /** `performance.now()` when the cytoscape instance was created. */
  mountedAt: number;
  /** First painted frame with the nodes in place. */
  firstFrameAt: number | null;
  /** Main thread free again (next macrotask), before the compositor gets a frame. */
  idleAt: number | null;
  /** Layout (or cache restore) finished. */
  settledAt: number | null;
  /** Where the starting positions came from. */
  source: "layout" | "cache" | "cache-partial" | "empty";
  /** Milliseconds spent in each step of the elements effect. */
  phases: Record<string, number>;
}

export interface GraphPerfCounters {
  /** Canvas instances created (one per mount). */
  mounts: number;
  /** Mounts that re-attached the kept instance instead of creating a canvas. */
  reuses: number;
  /** Layouts of any kind (preset rings/grid or the editor's force layout). */
  layouts: number;
  /** Deterministic ring or grouped placements. */
  presets: number;
  /** fcose runs, the expensive ones. */
  fcose: number;
  /** Exact position-cache hits. */
  cacheHits: number;
  /** Partial position-cache hits (same vault + layout, changed structure). */
  cachePartials: number;
  /** Camera restored from the cache instead of fitted. */
  cameraRestores: number;
  /** Animated moves into settled positions (none with reduced motion). */
  glides: number;
}

interface GraphPerfState {
  mounts: GraphPerfMount[];
  counters: GraphPerfCounters;
}

const enabled = import.meta.env.DEV || (window as { __BASICS_E2E__?: boolean }).__BASICS_E2E__ === true;

const state: GraphPerfState = {
  mounts: [],
  counters: {
    mounts: 0,
    reuses: 0,
    layouts: 0,
    presets: 0,
    fcose: 0,
    cacheHits: 0,
    cachePartials: 0,
    cameraRestores: 0,
    glides: 0,
  },
};

function publish(): void {
  if (!enabled) return;
  (window as { __basicsGraphPerf?: GraphPerfState }).__basicsGraphPerf = {
    mounts: state.mounts,
    counters: { ...state.counters },
  };
}

if (enabled) publish();

/** A mount record, or `null` when the build does not record timings. */
export function perfMount(mode: "full" | "local", nodes: number, edges: number): GraphPerfMount | null {
  if (!enabled) return null;
  state.counters.mounts += 1;
  const record: GraphPerfMount = {
    id: state.counters.mounts,
    mode,
    nodes,
    edges,
    mountedAt: performance.now(),
    firstFrameAt: null,
    idleAt: null,
    settledAt: null,
    source: "empty",
    phases: {},
  };
  state.mounts.push(record);
  publish();
  return record;
}

export function perfCount(name: keyof GraphPerfCounters, by = 1): void {
  if (!enabled) return;
  state.counters[name] += by;
  publish();
}

/** Records the next painted frame, so a synchronous layout run is part of the wait. */
export function perfFirstFrame(record: GraphPerfMount | null): void {
  if (!enabled || !record) return;
  setTimeout(() => {
    record.idleAt = performance.now();
    publish();
  }, 0);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      record.firstFrameAt = performance.now();
      publish();
    });
  });
}

export function perfSettled(record: GraphPerfMount | null, source: GraphPerfMount["source"]): void {
  if (!enabled || !record) return;
  record.settledAt = performance.now();
  record.source = source;
  publish();
}

/** Adds a named step to a mount record, so a slow first paint can be attributed. */
export function perfPhase(record: GraphPerfMount | null, name: string, ms: number): void {
  if (!enabled || !record) return;
  record.phases[name] = Math.round(ms * 10) / 10;
  publish();
}
