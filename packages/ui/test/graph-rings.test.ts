import type { GraphData, GraphNode, GraphNodeType } from "@marcozvd/basics-core";
import { describe, expect, it } from "vitest";
import { graphCacheKey } from "../src/components/graph/graph-cache";
import { nodeDiameter } from "../src/components/graph/graph-model";
import { computeRingLayout, nonOverlappingRingLabels } from "../src/components/graph/graph-rings";

const node = (id: string, type: GraphNodeType): GraphNode => ({ id, type, title: id, layers: [], degree: 0 });
const graph = (nodes: GraphNode[], links: [string, string][] = []): GraphData => ({
  nodes,
  edges: links.map(([source, target]) => ({ source, target, kind: "link" })),
});
const snapshot = (data: GraphData) => [...computeRingLayout(data).positions];

describe("full graph rings", () => {
  it("places profiles/projects together, then tech, practice, check and all other types", () => {
    const layout = computeRingLayout(
      graph([
        node("profile", "profile"),
        node("project", "project"),
        node("tech", "tech"),
        node("practice", "practice"),
        node("check", "check"),
        node("layer", "layer"),
        node("broken", "missing"),
        node("future", "future" as GraphNodeType),
      ]),
    );
    expect(layout.rings.map((ring) => new Set(ring.ids))).toEqual([
      new Set(["profile", "project"]),
      new Set(["tech"]),
      new Set(["practice"]),
      new Set(["check"]),
      new Set(["layer"]),
      new Set(["broken", "future"]),
    ]);
    layout.rings.forEach((ring, index) => {
      if (index) expect(ring.rows[0].radius - layout.rings[index - 1].radius).toBeGreaterThanOrEqual(66);
      for (const row of ring.rows) {
        for (const id of row.ids) {
          const position = layout.positions.get(id)!;
          expect(Math.hypot(position.x, position.y)).toBeCloseTo(row.radius);
        }
      }
    });
  });

  it("omits absent bands and handles an empty vault and a single centre node", () => {
    expect(computeRingLayout(graph([]))).toEqual({ positions: new Map(), rings: [] });
    expect(computeRingLayout(graph([node("p", "project")])).positions.get("p")).toEqual({ x: 0, y: 0 });
    const sparse = computeRingLayout(graph([node("t", "tech"), node("c", "check")]));
    const full = computeRingLayout(graph([node("p", "profile"), node("t", "tech"), node("c", "check")]));
    expect(sparse.rings.map((ring) => ring.band)).toEqual([1, 3]);
    expect(sparse.rings[1].radius).toBeLessThan(full.rings[2].radius);
  });

  it("fills sub-rings to their chord capacity without overlapping dots", () => {
    const small = computeRingLayout(graph(Array.from({ length: 6 }, (_, i) => node(`t${i}`, "tech"))));
    const large = computeRingLayout(graph(Array.from({ length: 120 }, (_, i) => node(`t${i}`, "tech"))));
    expect(large.rings[0].radius).toBeLessThan(small.rings[0].radius * 8);
    expect(large.rings[0].rows.length).toBeGreaterThan(1);
    large.rings[0].rows.forEach((row, index, rows) => {
      if (index) expect(row.radius - rows[index - 1].radius).toBe(48);
      if (index < rows.length - 1) expect(row.ids.length).toBe(Math.floor(Math.PI / Math.asin(48 / (2 * row.radius))));
    });
    const points = [...large.positions.values()];
    points.forEach((point, index) => {
      for (const next of points.slice(index + 1)) expect(Math.hypot(point.x - next.x, point.y - next.y)).toBeGreaterThanOrEqual(48 - 1e-8);
    });
  });

  it("separates crowded bands and high-degree dots, and culls full-width labels at label zoom", () => {
    const nodes = Array.from({ length: 300 }, (_, i) => ({
      ...node(`n${i}`, (["profile", "tech", "practice", "check", "layer", "missing"] as const)[Math.min(5, Math.floor(i / 50))]),
      degree: i % 80,
    }));
    const layout = computeRingLayout(graph(nodes));
    layout.rings.forEach((ring, index) => {
      if (index) expect(ring.rows[0].radius).toBeGreaterThan(layout.rings[index - 1].radius);
    });
    const boxes = nodes.map((n) => {
      const p = layout.positions.get(n.id)!;
      const dot = nodeDiameter(n.degree) / 2;
      return { id: n.id, x1: p.x - 74, x2: p.x + 74, y1: p.y - dot - 4, y2: p.y + dot + 24 };
    });
    const keep = nonOverlappingRingLabels(boxes);
    expect(keep.size).toBeGreaterThan(0);
    expect(keep.size).toBeLessThan(nodes.length);
    const visible = boxes.filter((box) => keep.has(box.id));
    for (const zoom of [0.6, 1, 2]) {
      visible.forEach((box, index) => {
        for (const other of visible.slice(index + 1)) {
          expect(
            box.x1 * zoom < other.x2 * zoom &&
              box.x2 * zoom > other.x1 * zoom &&
              box.y1 * zoom < other.y2 * zoom &&
              box.y2 * zoom > other.y1 * zoom,
          ).toBe(false);
        }
      });
    }
    expect(snapshot(graph([...nodes].reverse()))).toEqual([...layout.positions]);
    nodes.forEach((n, index) => {
      const p = layout.positions.get(n.id)!;
      for (const other of nodes.slice(index + 1)) {
        const q = layout.positions.get(other.id)!;
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan((nodeDiameter(n.degree) + nodeDiameter(other.degree)) / 2 + 23.99);
      }
    });
  });

  it.each([12, 120])("anchors %i tech nodes to inner links rather than titles", (count) => {
    const nodes = [node("p1", "profile"), node("p2", "project")];
    const links: [string, string][] = [];
    for (let i = 0; i < count; i++) {
      nodes.push(node(`t${i}`, "tech"));
      links.push([i % 2 ? "p1" : "p2", `t${i}`]);
    }
    const layout = computeRingLayout(graph(nodes, links));
    for (const [inner, outer] of links) {
      const p = layout.positions.get(inner)!;
      const t = layout.positions.get(outer)!;
      expect(p.x * t.x + p.y * t.y).toBeGreaterThan(0);
    }
    const renamed = nodes.map((n, i) => ({ ...n, title: `Reverse title ${nodes.length - i}` }));
    expect(snapshot(graph(renamed, links))).toEqual([...layout.positions]);
  });

  it("keeps same-ring chains contiguous without inward links", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => node(`t${i}`, "tech"));
    const links: [string, string][] = Array.from({ length: 5 }, (_, i) => [`t${i}`, `t${i + 1}`]);
    const ring = computeRingLayout(graph(nodes, links)).rings[0];
    const occupied = ring.ids.map((id, index) => (Number(id.slice(1)) < 6 ? index : -1)).filter((index) => index >= 0);
    expect(occupied.at(-1)! - occupied[0]).toBe(5);
  });

  it("is identical after input permutation, reversed links, duplicate links and dangling edges", () => {
    const nodes = [node("p", "profile"), ...Array.from({ length: 20 }, (_, i) => node(`t${i}`, i % 2 ? "tech" : "practice"))];
    const links: [string, string][] = nodes.slice(1).map((n, i) => [i % 3 ? "p" : "t1", n.id]);
    const original = graph(nodes, links);
    const changed = graph(
      [...nodes].reverse(),
      [...links].reverse().map(([a, b]) => [b, a]),
    );
    changed.edges.push(...original.edges, { source: "gone", target: "p", kind: "broken" });
    expect(snapshot(changed)).toEqual(snapshot(original));
    expect(original.nodes).toEqual(nodes);
  });

  it("invalidates flat cached positions when a note changes type or size", () => {
    const before = graph([node("p", "profile"), node("t", "tech")]);
    const after = graph([node("p", "profile"), node("t", "practice")]);
    expect(graphCacheKey("vault", "flat", before)).not.toBe(graphCacheKey("vault", "flat", after));
    after.nodes[1] = { ...before.nodes[1], degree: 80 };
    expect(graphCacheKey("vault", "flat", before)).not.toBe(graphCacheKey("vault", "flat", after));
  });
});
