import type { GraphData, GraphNode, GraphNodeType } from "@marcozvd/basics-core";

/** Toolbar order; `missing` only appears while broken links are shown. */
export const GRAPH_TYPES: GraphNodeType[] = ["tech", "practice", "check", "profile", "project", "layer", "missing"];

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Nodes whose id or title contains the query, best match first (exact, prefix, substring). */
export function matchNodes(nodes: GraphNode[], query: string): GraphNode[] {
  const q = fold(query.trim());
  if (!q) return [];
  const rank = (node: GraphNode) => {
    const id = fold(node.id);
    const title = fold(node.title);
    if (id === q || title === q) return 0;
    if (id.startsWith(q) || title.startsWith(q)) return 1;
    if (id.includes(q) || title.includes(q)) return 2;
    return -1;
  };
  return nodes
    .map((node) => ({ node, rank: rank(node) }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank || b.node.degree - a.node.degree || a.node.title.localeCompare(b.node.title))
    .map((entry) => entry.node);
}

/** The node plus every node one edge away. */
export function neighborhood(data: GraphData, id: string): Set<string> {
  const ids = new Set([id]);
  for (const edge of data.edges) {
    if (edge.source === id) ids.add(edge.target);
    if (edge.target === id) ids.add(edge.source);
  }
  return ids;
}

/**
 * Compound parent per node when grouping by layer. A node's `group` only counts when the
 * layer note itself is part of this data set, so a tech pointing at an unknown layer stays
 * outside the boxes (and the local graph stays flat).
 */
export function groupParents(data: GraphData): Map<string, string> {
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const parents = new Map<string, string>();
  for (const node of data.nodes) {
    if (!node.group || node.group === node.id) continue;
    if (byId.get(node.group)?.type === "layer") parents.set(node.id, node.group);
  }
  return parents;
}

/** Placement of one layer box in the grouped layout, in graph coordinates. */
export interface LayoutBox {
  /** Left edge. */
  x: number;
  /** Top edge. */
  y: number;
  width: number;
  height: number;
  /** Members inside the box. */
  count: number;
}

export interface LayoutLabel {
  id: string;
  title: string;
  band: "top" | "bottom";
  position: { x: number; y: number };
}

/** Everything the canvas needs to draw the grouped picture without running a force layout. */
export interface GroupedLayout {
  /** Position of every member and every ungrouped node, keyed by node id. */
  positions: Map<string, { x: number; y: number }>;
  /** Layer id -> box rectangle. */
  boxes: Map<string, LayoutBox>;
  parents: Map<string, string>;
  /** Ungrouped node id -> band it sits in. */
  bands: Map<string, "top" | "bottom">;
  labels: LayoutLabel[];
}

/**
 * Grouped grid geometry, in graph units. A cell must fit the largest dot, one line of
 * the node label, and `GROUPED_ROW_GAP`; the canvas caps dots and fonts to these values
 * so the promise holds at any fit zoom.
 */
export const GROUPED_CELL_WIDTH = 120;
export const GROUPED_CELL_HEIGHT = 64;
export const GROUPED_DOT_MAX = 28;
export const GROUPED_LABEL_FONT_MAX = 20;
export const GROUPED_LABEL_LINE = 24;
export const GROUPED_ROW_GAP = 8;

/** Dot diameter for a node; the grouped layout caps it at `GROUPED_DOT_MAX`. */
export function nodeDiameter(degree: number): number {
  return 18 + 4 * Math.sqrt(Math.max(0, degree));
}

export interface GroupedLayoutOptions {
  /** Member grid cell: room for the dot and the label under it. */
  cellWidth?: number;
  cellHeight?: number;
  /** Space between a box edge and its members. */
  padding?: number;
  /** Extra space at the top of a box for its title. */
  headerHeight?: number;
  /** Space between two boxes, and between a band and the boxes. */
  gap?: number;
  /** Room under the last grid row for the node labels, which compound bounds include. */
  labelSpace?: number;
  /** Width / height the boxes are packed towards. */
  aspect?: number;
  /** Band header titles; the canvas passes translated strings. */
  titles?: { top: string; bottom: string };
}

const MEMBER_ORDER: Record<string, number> = { tech: 0, practice: 1, check: 2, profile: 0, project: 1, missing: 2 };

/** Type order, then title, so the grid is stable between visits. */
function byMemberOrder(a: GraphNode, b: GraphNode): number {
  return (
    (MEMBER_ORDER[a.type] ?? 9) - (MEMBER_ORDER[b.type] ?? 9) ||
    (a.title < b.title ? -1 : a.title > b.title ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** Grid shape for `count` nodes; the 1.8 factor keeps cells closer to square on screen. */
function gridShape(count: number, cellWidth: number, cellHeight: number) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(count, 1) * 1.8)));
  const rows = Math.max(1, Math.ceil(count / cols));
  return { cols, rows, width: cols * cellWidth, height: rows * cellHeight };
}

/**
 * Pack member rows. Techs fill the grid first; practices, checks and other notes start
 * on a fresh row after them so the two kinds never share a row or interleave.
 */
function memberRows(list: GraphNode[], cols: number): GraphNode[][] {
  const rows: GraphNode[][] = [];
  for (const group of [list.filter((node) => node.type === "tech"), list.filter((node) => node.type !== "tech")]) {
    for (let index = 0; index < group.length; index += cols) rows.push(group.slice(index, index + cols));
  }
  return rows;
}

interface PackedItem {
  key: string;
  width: number;
  height: number;
}

/**
 * Shelf/masonry packing: boxes in reading order, each one dropped into the shortest
 * column, trying every column count and keeping the one closest to `aspect`.
 * Rectangles never overlap because each column is laid out independently.
 */
function packColumns(items: PackedItem[], gap: number, aspect: number) {
  const x = new Map<string, number>();
  const y = new Map<string, number>();
  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1.6;
  const maxColumns = Math.min(items.length, 8);
  let best = { columns: 1, width: 0, height: 0, score: Number.POSITIVE_INFINITY };

  for (let count = 1; count <= maxColumns; count++) {
    const heights = new Array<number>(count).fill(0);
    const widths = new Array<number>(count).fill(0);
    for (const item of items) {
      let column = 0;
      for (let i = 1; i < count; i++) if (heights[i] < heights[column]) column = i;
      heights[column] += (heights[column] > 0 ? gap : 0) + item.height;
      widths[column] = Math.max(widths[column], item.width);
    }
    const width = widths.reduce((sum, value) => sum + value, 0) + gap * (count - 1);
    const height = Math.max(...heights);
    const score = Math.abs(Math.log(width / Math.max(height, 1) / safeAspect));
    if (score < best.score) best = { columns: count, width, height, score };
  }

  // Assign each box to the shortest column, then stack each column from the top.
  const columns: PackedItem[][] = Array.from({ length: best.columns }, () => []);
  const heights = new Array<number>(best.columns).fill(0);
  for (const item of items) {
    let column = 0;
    for (let i = 1; i < best.columns; i++) if (heights[i] < heights[column]) column = i;
    columns[column].push(item);
    heights[column] += (heights[column] > 0 ? gap : 0) + item.height;
  }
  let offset = 0;
  columns.forEach((column, index) => {
    const width = Math.max(0, ...column.map((item) => item.width));
    let top = 0;
    for (const item of column) {
      x.set(item.key, offset);
      y.set(item.key, top);
      top += item.height + gap;
    }
    offset += width + (index < best.columns - 1 ? gap : 0);
  });

  return { width: best.width, height: best.height, x, y };
}

/**
 * Deterministic grouped layout: layer members in a grid inside their box, boxes packed
 * into non-overlapping columns, profiles/projects in a top band and cross-layer notes in
 * a bottom band. Pure function, no cytoscape: same input gives the same positions.
 */
export function computeGroupedLayout(data: GraphData, options: GroupedLayoutOptions = {}): GroupedLayout {
  const cellWidth = options.cellWidth ?? GROUPED_CELL_WIDTH;
  const cellHeight = options.cellHeight ?? GROUPED_CELL_HEIGHT;
  const padding = options.padding ?? 24;
  const headerHeight = options.headerHeight ?? 32;
  const gap = options.gap ?? 48;
  const labelSpace = options.labelSpace ?? 32;
  const titles = options.titles ?? { top: "Profiles & projects", bottom: "Cross-layer" };

  const parents = groupParents(data);
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const members = new Map<string, GraphNode[]>();
  for (const [id, layer] of parents) {
    const node = byId.get(id);
    if (!node) continue;
    const list = members.get(layer) ?? [];
    list.push(node);
    members.set(layer, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const boxes = new Map<string, LayoutBox>();
  const bands = new Map<string, "top" | "bottom">();
  const labels: LayoutLabel[] = [];

  // Boxes: largest first, stable by layer id.
  const boxIds = [...members.keys()]
    .filter((id) => byId.get(id)?.type === "layer")
    .sort((a, b) => (members.get(b)?.length ?? 0) - (members.get(a)?.length ?? 0) || (a < b ? -1 : a > b ? 1 : 0));

  const prepared = boxIds.map((id) => {
    const list = [...(members.get(id) ?? [])].sort(byMemberOrder);
    const cols = Math.max(1, Math.ceil(Math.sqrt(Math.max(list.length, 1) * 1.8)));
    const rows = memberRows(list, cols);
    return {
      id,
      list,
      cols,
      rows,
      width: cols * cellWidth + padding * 2,
      height: rows.length * cellHeight + padding * 2 + headerHeight + labelSpace,
    };
  });

  const packed = packColumns(
    prepared.map((box) => ({ key: box.id, width: box.width, height: box.height })),
    gap,
    options.aspect ?? 1.6,
  );

  const ungrouped = data.nodes.filter((node) => node.type !== "layer" && !parents.has(node.id)).sort(byMemberOrder);
  const topNodes = ungrouped.filter((node) => node.type === "profile" || node.type === "project");
  const bottomNodes = ungrouped.filter((node) => node.type !== "profile" && node.type !== "project");
  for (const node of topNodes) bands.set(node.id, "top");
  for (const node of bottomNodes) bands.set(node.id, "bottom");

  const topWidth = topNodes.length * cellWidth;
  const topHeight = topNodes.length > 0 ? headerHeight + cellHeight : 0;
  const bottomGrid = gridShape(bottomNodes.length, cellWidth, cellHeight);
  const bottomWidth = bottomNodes.length > 0 ? bottomGrid.width : 0;
  const contentWidth = Math.max(topWidth, packed.width, bottomWidth);

  const boxesTop = topNodes.length > 0 ? topHeight + gap : 0;
  const boxesOffsetX = (contentWidth - packed.width) / 2;

  for (const box of prepared) {
    const x = boxesOffsetX + (packed.x.get(box.id) ?? 0);
    const y = boxesTop + (packed.y.get(box.id) ?? 0);
    boxes.set(box.id, { x, y, width: box.width, height: box.height, count: box.list.length });
    // Cytoscape pads compound parents uniformly, so a tiny invisible child at the top
    // keeps the header space above the grid without inflating the side padding.
    positions.set(`spacer:${box.id}`, { x: x + box.width / 2, y: y + padding + 1 });
    box.rows.forEach((row, rowIndex) => {
      row.forEach((node, colIndex) => {
        positions.set(node.id, {
          x: x + padding + (colIndex + 0.5) * cellWidth,
          y: y + padding + headerHeight + (rowIndex + 0.5) * cellHeight,
        });
      });
    });
  }

  if (topNodes.length > 0) {
    const offsetX = (contentWidth - topWidth) / 2;
    topNodes.forEach((node, index) => {
      positions.set(node.id, { x: offsetX + (index + 0.5) * cellWidth, y: headerHeight + cellHeight / 2 });
    });
    labels.push({
      id: "band:top",
      title: titles.top,
      band: "top",
      position: { x: offsetX + topWidth / 2, y: headerHeight / 2 },
    });
  }

  // The bottom band hangs off the tallest stack of boxes, not the packed block height.
  if (bottomNodes.length > 0) {
    const boxesBottom = [...boxes.values()].reduce((max, box) => Math.max(max, box.y + box.height), boxesTop);
    const bottomTop = boxesBottom + gap;
    const offsetX = (contentWidth - bottomWidth) / 2;
    bottomNodes.forEach((node, index) => {
      const col = index % bottomGrid.cols;
      const row = Math.floor(index / bottomGrid.cols);
      positions.set(node.id, {
        x: offsetX + (col + 0.5) * cellWidth,
        y: bottomTop + headerHeight + (row + 0.5) * cellHeight,
      });
    });
    labels.push({
      id: "band:bottom",
      title: titles.bottom,
      band: "bottom",
      position: { x: offsetX + bottomWidth / 2, y: bottomTop + headerHeight / 2 },
    });
  }

  return { positions, boxes, parents, bands, labels };
}

/** Depth-1 subgraph around `id`, for the editor's local graph. */
export function localGraph(data: GraphData, id: string): GraphData {
  const ids = neighborhood(data, id);
  return {
    nodes: data.nodes.filter((node) => ids.has(node.id)),
    edges: data.edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)),
  };
}

/**
 * A layer view: the layer note, its techs, and the non-tech notes linked to those techs.
 * Other layers and their techs drop out so the slice stays readable.
 */
export function layerSlice(data: GraphData, layer: string): Set<string> {
  const byId = new Map(data.nodes.map((node) => [node.id, node]));
  const core = new Set(data.nodes.filter((node) => node.id === layer || node.layers.includes(layer)).map((node) => node.id));
  const ids = new Set(core);
  for (const edge of data.edges) {
    for (const [from, to] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ]) {
      const other = byId.get(to);
      if (core.has(from) && other && other.type !== "tech" && other.type !== "layer") ids.add(to);
    }
  }
  return ids;
}
