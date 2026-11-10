import type { GraphData, GraphNode, GraphNodeType } from "@marcozvd/basics-core";
import { describe, expect, it } from "vitest";
import { graphCacheKey } from "../src/components/graph/graph-cache";
import { computeRingLayout } from "../src/components/graph/graph-rings";

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
      new Set(["layer", "broken", "future"]),
    ]);
    layout.rings.forEach((ring, index) => {
      if (index) expect(ring.radius - layout.rings[index - 1].radius).toBeGreaterThan(160);
      for (const id of ring.ids) {
        const position = layout.positions.get(id)!;
        expect(Math.hypot(position.x, position.y)).toBeCloseTo(ring.radius);
      }
    });
  });

  it("omits absent bands and handles an empty vault and a single centre node", () => {
    expect(computeRingLayout(graph([]))).toEqual({ positions: new Map(), rings: [] });
    expect(computeRingLayout(graph([node("p", "project")])).positions.get("p")).toEqual({ x: 0, y: -0 });
    const sparse = computeRingLayout(graph([node("t", "tech"), node("c", "check")]));
    const full = computeRingLayout(graph([node("p", "profile"), node("t", "tech"), node("c", "check")]));
    expect(sparse.rings.map((ring) => ring.band)).toEqual([1, 3]);
    expect(sparse.rings[1].radius).toBeLessThan(full.rings[2].radius);
  });

  it("grows crowded rings and keeps dot/label envelopes separated", () => {
    const small = computeRingLayout(graph(Array.from({ length: 6 }, (_, i) => node(`t${i}`, "tech"))));
    const large = computeRingLayout(graph(Array.from({ length: 120 }, (_, i) => node(`t${i}`, "tech"))));
    expect(large.rings[0].radius).toBeGreaterThan(small.rings[0].radius * 10);
    const points = [...large.positions.values()];
    points.forEach((point, index) => {
      const next = points[(index + 1) % points.length];
      expect(Math.hypot(point.x - next.x, point.y - next.y)).toBeGreaterThan(170);
    });
  });

  it("anchors tech clusters to their inner links rather than their titles", () => {
    const nodes = [node("p1", "profile"), node("p2", "project")];
    const links: [string, string][] = [];
    for (let i = 0; i < 12; i++) {
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
