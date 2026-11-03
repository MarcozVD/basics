import type { GraphData } from "@marcozvd/basics-core";

/**
 * Where the graph was left: node positions and the camera, so coming back to `/graph`
 * (same session) or reloading the app shows the same picture without running a layout.
 *
 * Two layers: a module-level map that survives route changes, and `sessionStorage` that
 * survives a reload of the tab. Entries are keyed by a hash of the vault root, the layout
 * mode and the node/edge set; a changed structure still reuses the positions it knows so
 * only the new nodes are placed.
 */

export type GraphLayoutMode = "grouped" | "flat";

export interface GraphCamera {
  zoom: number;
  pan: { x: number; y: number };
}

export interface GraphPosition {
  x: number;
  y: number;
}

/** What the canvas needs to look up its own entry; computed by the page. */
export interface GraphCacheScope {
  /** Hash of vault + layout + structure. */
  key: string;
  vault: string;
  layout: GraphLayoutMode;
  /** False while a filter or focus narrows the view: the camera would not apply later. */
  camera: boolean;
}

export interface RecalledGraph {
  /** Positions of the nodes this data still has. */
  positions: Map<string, GraphPosition>;
  camera: GraphCamera | null;
  /** True when the structure is identical, so no layout is needed at all. */
  exact: boolean;
}

interface GraphCacheEntry {
  key: string;
  vault: string;
  layout: GraphLayoutMode;
  positions: Record<string, GraphPosition>;
  camera: GraphCamera | null;
  updated: number;
}

const STORAGE_KEY = "basics:graph-cache:v1";
const MAX_ENTRIES = 6;
/** Below this share of known nodes a partial entry is not worth seeding from. */
const PARTIAL_MIN_RATIO = 0.5;

const memory = new Map<string, GraphCacheEntry>();
let hydrated = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function hydrate(): void {
  if (hydrated) return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const entries = JSON.parse(raw) as unknown;
    if (!Array.isArray(entries)) return;
    for (const entry of entries) {
      const candidate = entry as Partial<GraphCacheEntry>;
      if (typeof candidate.key !== "string" || typeof candidate.vault !== "string") continue;
      if (candidate.layout !== "grouped" && candidate.layout !== "flat") continue;
      if (!candidate.positions || typeof candidate.positions !== "object") continue;
      memory.set(candidate.key, {
        key: candidate.key,
        vault: candidate.vault,
        layout: candidate.layout,
        positions: candidate.positions,
        camera: candidate.camera ?? null,
        updated: typeof candidate.updated === "number" ? candidate.updated : 0,
      });
    }
  } catch {
    // Private mode or a corrupt payload: the in-memory layer still works.
  }
}

function persist(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    const entries = [...memory.values()].sort((a, b) => b.updated - a.updated).slice(0, MAX_ENTRIES);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota or private mode: keep the in-memory copy.
  }
}

/** Coalesces camera writes during a pan/zoom gesture into one storage write. */
function schedulePersist(): void {
  if (saveTimer !== null) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persist();
  }, 300);
}

function hash(text: string): string {
  // FNV-1a, 32-bit; the input already carries the vault and layout, so a collision
  // would need the same ids and edges, which is the case the cache wants anyway.
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  }
  return `${(value >>> 0).toString(36)}:${text.length.toString(36)}`;
}

/** Stable key for one picture of the graph: vault + layout mode + nodes + edges. */
export function graphCacheKey(vault: string, layout: GraphLayoutMode, data: GraphData): string {
  const nodes = data.nodes.map((node) => node.id).sort();
  const edges = data.edges.map((edge) => `${edge.source}>${edge.target}`).sort();
  return hash(`${vault}\u0000${layout}\u0000${nodes.join("\u0001")}\u0000${edges.join("\u0001")}`);
}

/** Best entry for this vault and layout: exact first, otherwise the one sharing most nodes. */
function findEntry(scope: GraphCacheScope, ids: Set<string>): { entry: GraphCacheEntry; exact: boolean } | null {
  hydrate();
  const exact = memory.get(scope.key);
  if (exact) return { entry: exact, exact: true };
  let best: { entry: GraphCacheEntry; overlap: number } | null = null;
  for (const entry of memory.values()) {
    if (entry.vault !== scope.vault || entry.layout !== scope.layout) continue;
    let overlap = 0;
    for (const id of ids) if (entry.positions[id]) overlap += 1;
    if (overlap === 0) continue;
    if (overlap < ids.size * PARTIAL_MIN_RATIO) continue;
    if (!best || overlap > best.overlap) best = { entry, overlap };
  }
  return best ? { entry: best.entry, exact: false } : null;
}

/** Positions and camera for the previous visit, if any node of this data was seen before. */
export function recallGraph(scope: GraphCacheScope, nodeIds: string[]): RecalledGraph | null {
  const found = findEntry(scope, new Set(nodeIds));
  if (!found) return null;
  const positions = new Map<string, GraphPosition>();
  for (const id of nodeIds) {
    const position = found.entry.positions[id];
    if (position) positions.set(id, { ...position });
  }
  if (positions.size === 0) return null;
  return { positions, camera: scope.camera ? found.entry.camera : null, exact: found.exact };
}

/** Stores positions (and the camera) of the picture now on screen. */
export function rememberGraph(scope: GraphCacheScope, positions: Record<string, GraphPosition>, camera: GraphCamera | null): void {
  hydrate();
  const previous = memory.get(scope.key);
  memory.set(scope.key, {
    key: scope.key,
    vault: scope.vault,
    layout: scope.layout,
    positions,
    // A filtered view must not replace the camera a full view will restore.
    camera: scope.camera ? (camera ?? previous?.camera ?? null) : (previous?.camera ?? null),
    updated: Date.now(),
  });
  persist();
}

/** Updates only the camera (pan/zoom gestures); positions are unchanged by those. */
export function rememberCamera(scope: GraphCacheScope, camera: GraphCamera): void {
  if (!scope.camera) return;
  hydrate();
  const entry = memory.get(scope.key);
  if (!entry) return;
  entry.camera = camera;
  entry.updated = Date.now();
  schedulePersist();
}
