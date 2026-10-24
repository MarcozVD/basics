import type { GraphData, GraphNode, GraphNodeType } from "@marcozvd/basics-core";
import { describe, expect, it } from "vitest";
import {
  computeGroupedLayout,
  GROUPED_CELL_HEIGHT,
  GROUPED_DOT_MAX,
  GROUPED_LABEL_FONT_MAX,
  GROUPED_LABEL_LINE,
  GROUPED_ROW_GAP,
  type GroupedLayout,
  groupParents,
  type LayoutLabel,
  nodeDiameter,
} from "../src/components/graph/graph-model";

const node = (id: string, type: GraphNodeType, group?: string): GraphNode => ({
  id,
  type,
  title: id,
  layers: [],
  degree: 0,
  ...(group ? { group } : {}),
});

const data = (...nodes: GraphNode[]): GraphData => ({ nodes, edges: [] });

describe("graph layer grouping", () => {
  it("parents members to the layer note in the rendered data set", () => {
    const parents = groupParents(data(node("backend", "layer"), node("fastapi", "tech", "backend"), node("python", "tech", "backend")));
    expect(parents.get("fastapi")).toBe("backend");
    expect(parents.get("python")).toBe("backend");
  });

  it("leaves members of a layer that has no layer note outside the boxes", () => {
    const parents = groupParents(data(node("fastapi", "tech", "unknown-layer")));
    expect(parents.has("fastapi")).toBe(false);
  });

  it("does not parent to a non-layer node that shares the id", () => {
    const parents = groupParents(data(node("backend", "tech"), node("fastapi", "tech", "backend")));
    expect(parents.has("fastapi")).toBe(false);
  });

  it("keeps layers, profiles, projects and missing notes outside the boxes", () => {
    const parents = groupParents(
      data(node("backend", "layer"), node("ml-api", "profile"), node("shop", "project"), node("gone", "missing")),
    );
    expect(parents.size).toBe(0);
  });
});

/** A vault-shaped sample: boxes of different sizes plus ungrouped bands. */
function sample(): GraphData {
  const nodes: GraphNode[] = [];
  for (let layer = 0; layer < 6; layer++) {
    const id = `layer-${layer}`;
    nodes.push(node(id, "layer"));
    const count = 3 + layer * 2;
    for (let i = 0; i < count; i++) nodes.push(node(`${id}-tech-${i}`, "tech", id));
    nodes.push(node(`${id}-practice`, "practice", id));
    nodes.push(node(`${id}-check`, "check", id));
  }
  nodes.push(node("spans-layers", "practice"));
  nodes.push(node("missing-note", "missing"));
  nodes.push(node("a-profile", "profile"));
  nodes.push(node("a-project", "project"));
  return data(...nodes);
}

const intersects = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);

/** Approximate on-screen text box for a band header, wide enough for its title. */
const headerRect = (label: LayoutLabel) => {
  const width = Math.max(120, label.title.length * 10);
  const height = 24;
  return { x: label.position.x - width / 2, y: label.position.y - height / 2, width, height };
};

const snapshot = (layout: GroupedLayout) => ({
  positions: [...layout.positions.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
  boxes: [...layout.boxes.entries()].sort(([a], [b]) => (a < b ? -1 : 1)),
  labels: layout.labels,
});

describe("grouped preset layout", () => {
  it("never overlaps two boxes", () => {
    const layout = computeGroupedLayout(sample(), { aspect: 1.7 });
    const boxes = [...layout.boxes.values()];
    expect(boxes.length).toBe(6);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(intersects(boxes[i], boxes[j]), `${i} and ${j} overlap`).toBe(false);
      }
    }
  });

  it("keeps every member inside its own box", () => {
    const layout = computeGroupedLayout(sample());
    for (const [id, parent] of layout.parents) {
      const box = layout.boxes.get(parent);
      const position = layout.positions.get(id);
      expect(box, `${id} has no box`).toBeDefined();
      expect(position, `${id} has no position`).toBeDefined();
      if (!box || !position) continue;
      expect(position.x).toBeGreaterThan(box.x);
      expect(position.x).toBeLessThan(box.x + box.width);
      expect(position.y).toBeGreaterThan(box.y);
      expect(position.y).toBeLessThan(box.y + box.height);
    }
  });

  it("puts profiles/projects above every box and cross-layer notes below", () => {
    const layout = computeGroupedLayout(sample());
    const boxes = [...layout.boxes.values()];
    const top = boxes.reduce((min, box) => Math.min(min, box.y), Number.POSITIVE_INFINITY);
    const bottom = boxes.reduce((max, box) => Math.max(max, box.y + box.height), Number.NEGATIVE_INFINITY);
    expect(layout.positions.get("a-profile")?.y).toBeLessThan(top);
    expect(layout.positions.get("a-project")?.y).toBeLessThan(top);
    expect(layout.positions.get("spans-layers")?.y).toBeGreaterThan(bottom);
    expect(layout.positions.get("missing-note")?.y).toBeGreaterThan(bottom);
  });

  it("fits the largest dot, one label line and a row gap in a cell", () => {
    // The canvas caps dots and font sizes at these values, so this is the worst case.
    expect(GROUPED_LABEL_LINE).toBeGreaterThanOrEqual(GROUPED_LABEL_FONT_MAX * 1.2);
    const largestDot = Math.min(GROUPED_DOT_MAX, nodeDiameter(1000));
    expect(GROUPED_CELL_HEIGHT).toBeGreaterThanOrEqual(largestDot + GROUPED_LABEL_LINE + GROUPED_ROW_GAP);
  });

  it("keeps each band header above its band and clear of boxes and other headers", () => {
    const layout = computeGroupedLayout(sample());
    const top = layout.labels.find((label) => label.band === "top");
    const bottom = layout.labels.find((label) => label.band === "bottom");
    expect(top).toBeDefined();
    expect(bottom).toBeDefined();
    if (!top || !bottom) return;

    const topBandY = Math.min(
      ...[...layout.bands].filter(([, band]) => band === "top").map(([id]) => layout.positions.get(id)?.y ?? Number.POSITIVE_INFINITY),
    );
    const bottomBandY = Math.min(
      ...[...layout.bands].filter(([, band]) => band === "bottom").map(([id]) => layout.positions.get(id)?.y ?? Number.POSITIVE_INFINITY),
    );
    const boxes = [...layout.boxes.values()];
    const boxesTop = Math.min(...boxes.map((box) => box.y));
    const boxesBottom = Math.max(...boxes.map((box) => box.y + box.height));

    const topRect = headerRect(top);
    const bottomRect = headerRect(bottom);
    expect(topRect.y + topRect.height).toBeLessThanOrEqual(topBandY);
    expect(topRect.y + topRect.height).toBeLessThanOrEqual(boxesTop);
    expect(bottomRect.y).toBeGreaterThanOrEqual(boxesBottom);
    expect(bottomRect.y + bottomRect.height).toBeLessThanOrEqual(bottomBandY);

    for (const box of boxes) {
      expect(intersects(topRect, box), "top header intersects a box").toBe(false);
      expect(intersects(bottomRect, box), "bottom header intersects a box").toBe(false);
    }
    expect(intersects(topRect, bottomRect), "band headers intersect each other").toBe(false);
  });

  it("positions every non-layer node exactly once", () => {
    const data = sample();
    const layout = computeGroupedLayout(data);
    const placed = data.nodes.filter((item) => item.type !== "layer");
    expect(placed.every((item) => layout.positions.has(item.id))).toBe(true);
    // One position per member/ungrouped node, plus the invisible header spacer per box.
    expect(layout.positions.size).toBe(placed.length + layout.boxes.size);
    for (const id of layout.boxes.keys()) expect(layout.positions.has(`spacer:${id}`)).toBe(true);
    expect(layout.labels.map((label) => label.band).sort()).toEqual(["bottom", "top"]);
  });

  it("gives identical positions for the same input", () => {
    expect(snapshot(computeGroupedLayout(sample()))).toEqual(snapshot(computeGroupedLayout(sample())));
  });

  it("keeps a box's members ordered by type, with practices/checks after the techs", () => {
    const nodes: GraphNode[] = [
      node("backend", "layer"),
      node("z-tech", "tech", "backend"),
      node("a-check", "check", "backend"),
      node("a-tech", "tech", "backend"),
      node("a-practice", "practice", "backend"),
    ];
    const layout = computeGroupedLayout(data(...nodes));
    const [techA, techZ, practice, check] = ["a-tech", "z-tech", "a-practice", "a-check"].map((id) => layout.positions.get(id)!);
    expect(techA.y).toBe(techZ.y);
    expect(techA.x).toBeLessThan(techZ.x);
    expect(practice.y).toBeGreaterThan(techA.y);
    expect(check.y).toBe(practice.y);
    expect(practice.x).toBeLessThan(check.x);
  });
});
