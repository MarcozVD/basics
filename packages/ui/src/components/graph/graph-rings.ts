import type { GraphData, GraphNode } from "@marcozvd/basics-core";
import { nodeDiameter } from "./graph-model";

export interface GraphRing {
  /** Profiles/projects, techs, practices, checks, then all other nodes. */
  band: number;
  radius: number;
  /** Clockwise order, starting at the ring's rotation. */
  ids: string[];
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
]);
const TURN = Math.PI * 2;
/** Matches the canvas's capped label width and 12px label under each dot. */
const LABEL_WIDTH = 140;
const LABEL_HEIGHT = 14.4;
const GAP = 24;

function hash(id: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) value = Math.imul(value ^ id.charCodeAt(i), 16777619);
  return value >>> 0;
}

const angle = (value: number) => ((value % TURN) + TURN) % TURN;

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
  const bands: GraphNode[][] = Array.from({ length: 5 }, () => []);
  for (const node of data.nodes) bands[BANDS.get(node.type) ?? 4].push(node);

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
    let rotationX = 0;
    let rotationY = 0;
    ids.forEach((id, index) => {
      if (!preferred.has(id)) return;
      const offset = desired(id) - (index * TURN) / ids.length;
      rotationX += Math.cos(offset);
      rotationY += Math.sin(offset);
    });
    const rotation = Math.hypot(rotationX, rotationY) > 1e-8 ? Math.atan2(rotationY, rotationX) : -Math.PI / 2;
    // A circle enclosing the complete dot + label box makes spacing safe at every angle.
    const extent = nodes.reduce((max, node) => {
      const dot = nodeDiameter(node.degree);
      return Math.max(max, Math.hypot(Math.max(LABEL_WIDTH, dot) / 2, dot / 2 + 4 + LABEL_HEIGHT));
    }, 0);
    const circumferenceRadius = ids.length > 1 ? (2 * extent + GAP) / (2 * Math.sin(Math.PI / ids.length)) : 0;
    const radius = Math.max(circumferenceRadius, rings.length ? previousRadius + previousExtent + extent + GAP : 0);
    ids.forEach((id, index) => {
      const theta = rotation + (index * TURN) / ids.length;
      angles.set(id, angle(theta));
      positions.set(id, { x: Math.cos(theta) * radius, y: Math.sin(theta) * radius });
    });
    rings.push({ band, radius, ids });
    previousRadius = radius;
    previousExtent = extent;
  });
  return { positions, rings };
}
