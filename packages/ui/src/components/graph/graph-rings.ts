import type { GraphData, GraphNode } from "@marcozvd/basics-core";
import { nodeDiameter } from "./graph-model";

export interface GraphRing {
  /** Profiles/projects, techs, practices, checks, layers, then other nodes. */
  band: number;
  radius: number;
  /** Clockwise order, starting at the ring's rotation. */
  ids: string[];
  /** Packed rows inside this band; only the outer boundary gets a guide. */
  rows: { radius: number; ids: string[] }[];
}

export interface RingLayout {
  positions: Map<string, { x: number; y: number }>;
  rings: GraphRing[];
}

const BANDS = new Map<string, number>([
  ["profile", 0],
  ["project", 0],
  ["tech", 1],
  ["practice", 2],
  ["check", 3],
  ["layer", 4],
]);
const TURN = Math.PI * 2;
const GAP = 24;
const BAND_GAP = 48;

function hash(id: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) value = Math.imul(value ^ id.charCodeAt(i), 16777619);
  return value >>> 0;
}

const angle = (value: number) => ((value % TURN) + TURN) % TURN;

export interface RingLabelBox {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Keep higher-priority measured labels first. Grid buckets avoid a quadratic scan. */
export function nonOverlappingRingLabels(boxes: RingLabelBox[]): Set<string> {
  const cells = new Map<string, RingLabelBox[]>();
  const keep = new Set<string>();
  for (const box of boxes) {
    const keys: string[] = [];
    for (let x = Math.floor(box.x1 / 160); x <= Math.floor(box.x2 / 160); x++) {
      for (let y = Math.floor(box.y1 / 160); y <= Math.floor(box.y2 / 160); y++) keys.push(`${x}:${y}`);
    }
    if (
      keys.some((key) => cells.get(key)?.some((other) => box.x1 < other.x2 && box.x2 > other.x1 && box.y1 < other.y2 && box.y2 > other.y1))
    )
      continue;
    keep.add(box.id);
    for (const key of keys) {
      const cell = cells.get(key) ?? [];
      cell.push(box);
      cells.set(key, cell);
    }
  }
  return keep;
}

/**
 * Full-vault rings, without a simulation or browser state. Only populated bands occupy
 * space. Inner links set preferred angles; a traversal of same-band links keeps clusters
 * together when there is no inward anchor. Stable hashes break ties without title order.
 * Work is O((V + E) log V), including sorted adjacency lists for reproducible sums.
 */
export function computeRingLayout(data: GraphData): RingLayout {
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const hashes = new Map(data.nodes.map((node) => [node.id, hash(node.id)]));
  const compare = (a: string, b: string) => (hashes.get(a) ?? 0) - (hashes.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0);
  const neighbors = new Map(data.nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of data.edges) {
    if (edge.source === edge.target || !byId.has(edge.source) || !byId.has(edge.target)) continue;
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }
  const adjacent = new Map([...neighbors].map(([id, ids]) => [id, [...ids].sort(compare)]));
  const bands: GraphNode[][] = Array.from({ length: 6 }, () => []);
  for (const node of data.nodes) bands[BANDS.get(node.type) ?? 5].push(node);

  const positions: RingLayout["positions"] = new Map();
  const angles = new Map<string, number>();
  const rings: GraphRing[] = [];
  let previousRadius = 0;
  let previousExtent = 0;
  bands.forEach((nodes, band) => {
    if (!nodes.length) return;
    const members = new Set(nodes.map((node) => node.id));
    const visited = new Set<string>();
    const traversal: string[] = [];
    // Start with hubs. Each connected component is contiguous, including isolated notes.
    const roots = [...members].sort((a, b) => (adjacent.get(b)?.length ?? 0) - (adjacent.get(a)?.length ?? 0) || compare(a, b));
    for (const root of roots) {
      const stack = [root];
      while (stack.length) {
        const id = stack.pop() as string;
        if (visited.has(id)) continue;
        visited.add(id);
        traversal.push(id);
        const links = adjacent.get(id) ?? [];
        for (let i = links.length - 1; i >= 0; i--) {
          if (members.has(links[i]) && !visited.has(links[i])) stack.push(links[i]);
        }
      }
    }
    const preferred = new Map<string, number>();
    for (const id of traversal) {
      let x = 0;
      let y = 0;
      for (const other of adjacent.get(id) ?? []) {
        const inner = angles.get(other);
        if (inner === undefined) continue;
        x += Math.cos(inner);
        y += Math.sin(inner);
      }
      if (Math.hypot(x, y) > 1e-8) preferred.set(id, angle(Math.atan2(y, x)));
    }
    // Let unanchored neighbors follow the closest inward-linked member of their cluster.
    const queue = traversal.filter((id) => preferred.has(id));
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      for (const other of adjacent.get(id) ?? []) {
        if (!members.has(other) || preferred.has(other)) continue;
        preferred.set(other, preferred.get(id) as number);
        queue.push(other);
      }
    }
    const order = new Map(traversal.map((id, index) => [id, index]));
    const desired = (id: string) => preferred.get(id) ?? ((order.get(id) as number) * TURN) / nodes.length;
    const ids = traversal.sort((a, b) => desired(a) - desired(b) || (order.get(a) as number) - (order.get(b) as number));
    const extent = Math.max(...nodes.map((node) => nodeDiameter(node.degree) / 2));
    const spacing = Math.max(48, extent * 2 + GAP);
    const rows: GraphRing["rows"] = [];
    let remaining = ids.length;
    let radius = rings.length ? previousRadius + previousExtent + extent + BAND_GAP : ids.length === 1 ? 0 : spacing;
    while (remaining) {
      // Chord capacity, rather than arc length, keeps adjacent dots separated.
      const capacity = radius === 0 ? 1 : Math.max(1, Math.floor(Math.PI / Math.asin(Math.min(1, spacing / (2 * radius)))));
      const count = Math.min(remaining, capacity);
      rows.push({ radius, ids: Array<string>(count) });
      remaining -= count;
      if (remaining) radius += spacing;
    }
    // Interleave rows by angle so inward-linked clusters occupy the same sector
    // across the band, instead of wrapping each contiguous chunk around a circle.
    const slots = rows.flatMap((row, rowIndex) =>
      row.ids.fill("").map((_, index) => ({ row, rowIndex, index, theta: ((index + 0.5) * TURN) / row.ids.length })),
    );
    slots.sort((a, b) => a.theta - b.theta || a.rowIndex - b.rowIndex);
    let rotationX = 0;
    let rotationY = 0;
    ids.forEach((id, index) => {
      if (!preferred.has(id)) return;
      const offset = desired(id) - slots[index].theta;
      rotationX += Math.cos(offset);
      rotationY += Math.sin(offset);
    });
    const rotation = Math.hypot(rotationX, rotationY) > 1e-8 ? Math.atan2(rotationY, rotationX) : -Math.PI / 2;
    ids.forEach((id, index) => {
      const slot = slots[index];
      slot.row.ids[slot.index] = id;
      const theta = rotation + slot.theta;
      angles.set(id, angle(theta));
      positions.set(id, { x: Math.cos(theta) * slot.row.radius, y: Math.sin(theta) * slot.row.radius });
    });
    rings.push({ band, radius, ids, rows });
    previousRadius = radius;
    previousExtent = extent;
  });
  return { positions, rings };
}
