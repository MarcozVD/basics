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
