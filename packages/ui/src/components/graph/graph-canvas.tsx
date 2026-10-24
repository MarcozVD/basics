import type { GraphData, GraphNodeType } from "@marcozvd/basics-core";
import cytoscape, { type Core, type ElementDefinition, type NodeSingular, type Position, type StylesheetJson } from "cytoscape";
import fcose from "cytoscape-fcose";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { type TranslationKey, useT } from "@/i18n";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";
import {
  computeGroupedLayout,
  GRAPH_TYPES,
  GROUPED_DOT_MAX,
  GROUPED_LABEL_FONT_MAX,
  type GroupedLayout,
  localGraph,
  matchNodes,
  nodeDiameter,
} from "./graph-model";

cytoscape.use(fcose);

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface GraphCanvasHandle {
  /** Fit the visible nodes inside the canvas minus the insets. */
  fit: () => void;
  /** Pan (and zoom in if needed) so the node sits in the middle of the free area. */
  centerOn: (id: string, opts?: { avoidRight?: number }) => void;
}

export interface GraphCanvasProps {
  data: GraphData;
  mode: "full" | "local";
  /** Local mode: the note the mini graph is built around. */
  centerId?: string;
  /** Node ids to show; `null` shows everything. */
  visibleIds?: Set<string> | null;
  /** Highlights matching nodes and dims the rest. */
  query?: string;
  /** Draw layer notes as compound boxes around their members (full graph only). */
  grouped?: boolean;
  selectedId?: string | null;
  /** Free space kept around the graph when fitting (floating toolbar, dock). */
  insets?: Insets;
  onNodeClick?: (id: string) => void;
  onBackgroundClick?: () => void;
  className?: string;
  ref?: Ref<GraphCanvasHandle>;
}

interface Palette {
  types: Record<GraphNodeType, string>;
  foreground: string;
  muted: string;
  surface: string;
  background: string;
  border: string;
  borderOpacity: number;
  broken: string;
}

interface Hover {
  id: string;
  title: string;
  type: GraphNodeType;
  degree: number;
  x: number;
  y: number;
  radius: number;
}

const FONT = '"Geist Variable", ui-sans-serif, system-ui, sans-serif';
const LABEL_SIZE = 11;
/** Labels disappear once the zoom drops below 0.6 (cytoscape compares font size × zoom). */
const LABEL_MIN_ZOOM = 0.6;
/** Grouped mode: the box title must read at the fit zoom, so it is scaled by it. */
const BOX_LABEL_SIZE = 14;
const NODE_LABEL_MIN_SCREEN = 9;
const BOX_LABEL_MIN_SCREEN = 14;
/** Practice and check labels stay hidden until the reader zooms in this far. */
const DETAIL_LABEL_ZOOM = 1.25;
/** Titles in a box grid are cut short; the hover tooltip and the panel keep the full one. */
const LABEL_TRUNCATE = 16;
const MAX_FIT_ZOOM = 1.6;
const LAYOUT_MS = 400;
const CAMERA_MS = 280;
/** Above this many nodes panning draws a cached texture and skips edges. */
const LARGE_GRAPH = 300;
const NO_INSETS: Insets = { top: 16, right: 16, bottom: 16, left: 16 };

const edgeId = (source: string, target: string) => `edge:${source}|${target}`;

/** Cytoscape keeps colour and opacity apart; split alpha out of hex or rgba() tokens. */
function splitAlpha(value: string): { color: string; opacity: number } {
  const rgba = /^rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(value);
  if (rgba) {
    const alpha = rgba[4] ? (rgba[4].endsWith("%") ? Number.parseFloat(rgba[4]) / 100 : Number.parseFloat(rgba[4])) : 1;
    return { color: `rgb(${rgba[1]}, ${rgba[2]}, ${rgba[3]})`, opacity: alpha };
  }
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (hex) return { color: `#${hex[1]}`, opacity: hex[2] ? Number.parseInt(hex[2], 16) / 255 : 1 };
  return { color: value, opacity: 1 };
}

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  // Cytoscape's colour parser only takes 3/6-digit hex, rgb() and rgba(); tokens like
  // `--border: #00000014` need the alpha split out.
  const read = (name: string) => {
    const value = css.getPropertyValue(name).trim();
    const hex = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(value);
    if (!hex) return value;
    const rgb = Number.parseInt(hex[1], 16);
    return `rgba(${(rgb >> 16) & 255}, ${(rgb >> 8) & 255}, ${rgb & 255}, ${Number.parseInt(hex[2], 16) / 255})`;
  };
  const types = Object.fromEntries(
    GRAPH_TYPES.map((type) => [type, read(type === "missing" ? "--destructive" : `--type-${type}`)]),
  ) as Record<GraphNodeType, string>;
  const rawBorder = splitAlpha(css.getPropertyValue("--border").trim());
  return {
    types,
    foreground: read("--foreground"),
    muted: read("--muted-foreground"),
    surface: read("--muted"),
    background: read("--background"),
    // Border tokens carry their alpha in the colour; cytoscape keeps colour and opacity apart.
    border: rawBorder.color,
    borderOpacity: rawBorder.opacity,
    broken: read("--destructive"),
  };
}

function buildStyle(palette: Palette, reduce: boolean): StylesheetJson {
  return [
    {
      selector: "node",
      style: {
        "background-color": (node: NodeSingular) => palette.types[node.data("type") as GraphNodeType] ?? palette.muted,
        width: "data(size)",
        height: "data(size)",
        label: "data(label)",
        "font-family": FONT,
        "font-size": LABEL_SIZE,
        "font-weight": 500,
        color: palette.muted,
        "text-valign": "bottom",
        "text-halign": "center",
        "text-margin-y": 4,
        "text-max-width": "140px",
        "text-wrap": "ellipsis",
        "text-outline-color": palette.background,
        "text-outline-width": 2,
        "min-zoomed-font-size": LABEL_SIZE * LABEL_MIN_ZOOM,
        "overlay-opacity": 0,
        "transition-property": "opacity",
        "transition-duration": reduce ? 0 : 120,
      },
    },
    {
      selector: 'node[type = "missing"]',
      style: {
        "background-opacity": 0.14,
        "border-width": 1.5,
        "border-style": "dashed",
        "border-color": palette.broken,
        color: palette.broken,
      },
    },
    {
      selector: "node:parent",
      style: {
        // The layer box: a quiet surface behind its techs, with the layer name on top.
        shape: "round-rectangle",
        "corner-radius": "16px",
        padding: "24px",
        "background-color": palette.surface,
        "background-opacity": 0.45,
        "border-width": 1,
        "border-color": palette.border,
        "border-opacity": palette.borderOpacity,
        label: "data(boxLabel)",
        "text-valign": "top",
        "text-halign": "center",
        "text-margin-y": 10,
        "text-wrap": "none",
        "text-max-width": "2000px",
        "font-size": BOX_LABEL_SIZE,
        "font-weight": 600,
        color: palette.muted,
        "min-zoomed-font-size": 0,
        "text-outline-color": palette.background,
        "text-outline-width": 3,
        "overlay-opacity": 0,
      },
    },
    {
      // Band headers ("Profiles & projects", "Cross-layer") are label-only nodes.
      selector: "node[bandLabel]",
      style: {
        width: 1,
        height: 1,
        "background-opacity": 0,
        "border-width": 0,
        label: "data(label)",
        "text-valign": "center",
        "text-halign": "center",
        "text-wrap": "none",
        "text-max-width": "2000px",
        "font-size": BOX_LABEL_SIZE,
        "font-weight": 600,
        color: palette.muted,
        "min-zoomed-font-size": 0,
        "text-outline-color": palette.background,
        "text-outline-width": 3,
        "overlay-opacity": 0,
      },
    },
    {
      // Invisible child that reserves the box header above the member grid.
      selector: "node[spacer]",
      style: {
        width: 2,
        height: 2,
        "background-opacity": 0,
        "border-width": 0,
        label: "",
        "text-opacity": 0,
        "overlay-opacity": 0,
      },
    },
    {
      // In a box grid the cells are tight; labels stay inside them. Box parents are
      // excluded: their layer title must render in full, however wide it is.
      selector:
        'node[grouped = 1][type = "tech"], node[grouped = 1][type = "practice"], node[grouped = 1][type = "check"], node[grouped = 1][type = "profile"], node[grouped = 1][type = "project"], node[grouped = 1][type = "missing"]',
      style: { "text-max-width": "112px" },
    },
    {
      // Practice and check labels appear when zoomed in, on hover, selection or search.
      selector: 'node[grouped = 1][type = "practice"], node[grouped = 1][type = "check"]',
      style: { "text-opacity": 0 },
    },
    {
      selector:
        'node[grouped = 1].lit[type = "practice"], node[grouped = 1].lit[type = "check"], node[grouped = 1].picked[type = "practice"], node[grouped = 1].picked[type = "check"], node[grouped = 1].hit[type = "practice"], node[grouped = 1].hit[type = "check"]',
      style: { "text-opacity": 1 },
    },
    {
      // Zoomed in far enough that the grid has room: practice/check titles appear.
      selector: 'node[grouped = 1].zoomed[type = "practice"], node[grouped = 1].zoomed[type = "check"]',
      style: { "text-opacity": 1 },
    },
    {
      selector: "edge",
      style: {
        width: 1,
        "line-color": palette.muted,
        "line-opacity": 0.35,
        "curve-style": "haystack",
        "haystack-radius": 0,
        "overlay-opacity": 0,
        "transition-property": "opacity",
        "transition-duration": reduce ? 0 : 120,
      },
    },
    {
      selector: 'edge[kind = "broken"]',
      style: {
        "curve-style": "straight",
        "line-color": palette.broken,
        "line-style": "dashed",
        "line-dash-pattern": [4, 3],
        "line-opacity": 0.75,
      },
    },
    // Grouped mode hides the web of cross-box links; only the active node's edges show.
    { selector: "edge.veiled", style: { display: "none" } },
    // An edge between a node and its own layer box repeats what containment already shows,
    // and draws a line into the middle of its own box. Never rendered in grouped mode.
    { selector: "edge.intraBox", style: { display: "none" } },
    { selector: ".dim", style: { opacity: 0.2 } },
    {
      selector: "node.hit",
      style: {
        color: palette.foreground,
        "border-width": 2,
        "border-color": palette.foreground,
        "border-opacity": 0.85,
        "border-style": "solid",
      },
    },
    { selector: ".fade", style: { opacity: 0.25 } },
    { selector: "node.lit", style: { opacity: 1, color: palette.foreground, "z-index": 10 } },
    { selector: "edge.lit", style: { opacity: 1, width: 1.5, "line-opacity": 0.7 } },
    { selector: 'edge.lit[kind = "link"]', style: { "line-color": palette.foreground } },
    {
      selector: "node.picked",
      style: {
        // A ring with a gap reads on every type colour, including the accent-blue techs.
        "border-width": 2,
        "border-color": palette.background,
        "border-opacity": 1,
        "border-style": "solid",
        "outline-width": 2,
        "outline-color": palette.foreground,
        color: palette.foreground,
        "font-weight": 600,
        "z-index": 20,
      },
    },
    { selector: ".gone", style: { display: "none" } },
  ];
}

function truncateLabel(title: string): string {
  return title.length > LABEL_TRUNCATE ? `${title.slice(0, LABEL_TRUNCATE - 1)}…` : title;
}

function toElements(data: GraphData, layout: GroupedLayout | null): ElementDefinition[] {
  const parents = layout?.parents ?? new Map<string, string>();
  const boxCounts = new Map<string, number>();
  for (const parent of parents.values()) boxCounts.set(parent, (boxCounts.get(parent) ?? 0) + 1);

  return [
    ...data.nodes.map((node) => {
      const parent = parents.get(node.id);
      const boxed = layout !== null && node.type === "layer" && boxCounts.has(node.id);
      return {
        group: "nodes" as const,
        data: {
          id: node.id,
          type: node.type,
          title: node.title,
          degree: node.degree,
          size: layout ? Math.min(nodeDiameter(node.degree), GROUPED_DOT_MAX) : nodeDiameter(node.degree),
          // Box grids cut long titles; the tooltip and the panel keep the full one.
          label: layout && node.type === "tech" ? truncateLabel(node.title) : node.title,
          ...(parent ? { parent } : {}),
          ...(boxed ? { boxLabel: `${node.title} · ${boxCounts.get(node.id)}` } : {}),
          ...(layout && !parent && node.type !== "layer" ? { band: layout.bands.get(node.id) ?? "bottom" } : {}),
          ...(layout ? { grouped: 1 } : {}),
        },
      };
    }),
    ...(layout
      ? [...layout.boxes.keys()].map((layer) => ({
          group: "nodes" as const,
          data: { id: `spacer:${layer}`, type: "spacer", title: "", label: "", parent: layer, spacer: 1, size: 2 },
        }))
      : []),
    ...(layout?.labels ?? []).map((label) => ({
      group: "nodes" as const,
      data: { id: label.id, type: "band", title: label.title, label: label.title, bandLabel: 1, band: label.band, size: 1 },
    })),
    ...data.edges.map((edge) => ({
      group: "edges" as const,
      data: {
        id: edgeId(edge.source, edge.target),
        source: edge.source,
        target: edge.target,
        kind: edge.kind,
      },
    })),
  ];
}

/** Final positions of nodes still gliding into place after a layout. */
const gliding = new WeakMap<Core, Map<string, Position>>();
/** Instances that have already run a full layout, so refreshes stay incremental. */
const laidOut = new WeakSet<Core>();

/** Stable 0..1 jitter from an id, so new nodes land beside their neighbours the same way. */
function hashJitter(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return (hash >>> 0) / 4294967296;
}

/** Bounding box of `eles` where they will end up, so a fit during a glide lands right. */
function settledBox(cy: Core, eles: cytoscape.Collection) {
  const targets = gliding.get(cy);
  if (!targets) return eles.boundingBox({});
  let x1 = Number.POSITIVE_INFINITY;
  let y1 = Number.POSITIVE_INFINITY;
  let x2 = Number.NEGATIVE_INFINITY;
  let y2 = Number.NEGATIVE_INFINITY;
  eles.nodes().forEach((node) => {
    const now = node.position();
    const end = targets.get(node.id()) ?? now;
    const bb = node.boundingBox({});
    x1 = Math.min(x1, bb.x1 - now.x + end.x);
    y1 = Math.min(y1, bb.y1 - now.y + end.y);
    x2 = Math.max(x2, bb.x2 - now.x + end.x);
    y2 = Math.max(y2, bb.y2 - now.y + end.y);
  });
  return { x1, y1, w: x2 - x1, h: y2 - y1 };
}

/** Zoom and pan so `eles` fill the canvas minus `insets`. */
function fitTo(cy: Core, eles: cytoscape.Collection, insets: Insets, animate: boolean) {
  if (eles.empty()) return;
  const box = settledBox(cy, eles);
  const width = Math.max(cy.width() - insets.left - insets.right, 40);
  const height = Math.max(cy.height() - insets.top - insets.bottom, 40);
  const zoom = Math.min(Math.max(Math.min(width / Math.max(box.w, 1), height / Math.max(box.h, 1)), cy.minZoom()), MAX_FIT_ZOOM);
  const pan = {
    x: insets.left + width / 2 - zoom * (box.x1 + box.w / 2),
    y: insets.top + height / 2 - zoom * (box.y1 + box.h / 2),
  };
  cy.stop(true);
  if (animate) cy.animate({ zoom, pan }, { duration: CAMERA_MS, easing: "ease-out-cubic" });
  else cy.viewport({ zoom, pan });
  scaleLabelsToFit(cy, zoom);
  toggleDetailLabels(cy);
}

/**
 * fcose seeds its initial positions with `Math.random`. Swapping in a small LCG for the
 * synchronous layout run keeps the first picture identical between visits.
 */
function withSeededRandom<T>(run: () => T): T {
  const original = Math.random;
  let state = 0x9e3779b9;
  Math.random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  try {
    return run();
  } finally {
    Math.random = original;
  }
}

/**
 * Scale labels so a box title reads at least 14 screen px at the current (fit) zoom.
 * Base sizes are in graph units, so they must be divided by the zoom. Member labels
 * stop at `GROUPED_LABEL_FONT_MAX`: that keeps one label line inside a grid cell next
 * to the largest dot, even when the fit zoom drops.
 */
function scaleLabelsToFit(cy: Core, zoom: number): void {
  if (cy.nodes("[grouped]").empty()) return;
  const safeZoom = Math.max(zoom, 0.05);
  const nodeFont = Math.min(GROUPED_LABEL_FONT_MAX, Math.max(LABEL_SIZE, NODE_LABEL_MIN_SCREEN / safeZoom));
  const boxFont = Math.min(64, Math.max(BOX_LABEL_SIZE, BOX_LABEL_MIN_SCREEN / safeZoom));
  cy.batch(() => {
    cy.nodes().not(":parent, [bandLabel]").style("font-size", nodeFont);
    cy.nodes(":parent, [bandLabel]").style("font-size", boxFont);
  });
}

/**
 * Practice and check titles are noise at the fit zoom: they join the tech labels only
 * once the reader zooms past `DETAIL_LABEL_ZOOM` (hover and selection still show them).
 */
function toggleDetailLabels(cy: Core): void {
  const show = cy.zoom() >= DETAIL_LABEL_ZOOM;
  cy.batch(() => {
    cy.nodes('[type = "practice"], [type = "check"]').toggleClass("zoomed", show);
  });
}

/**
 * Deterministic grouped layout: positions come from `computeGroupedLayout`; no force
 * simulation runs, so first paint is instant and identical between visits.
 */
function runPresetLayout(cy: Core, layout: GroupedLayout): void {
  const started = performance.now();
  const labelPositions = new Map(layout.labels.map((label) => [label.id, label.position]));
  cy.batch(() => {
    cy.nodes().forEach((node) => {
      const position = layout.positions.get(node.id()) ?? labelPositions.get(node.id());
      if (position) node.position(position);
    });
  });
  if (import.meta.env.DEV) {
    const elapsed = (performance.now() - started).toFixed(2);
    console.debug(`[graph] preset ${layout.positions.size} nodes in ${elapsed}ms`);
  }
}

/**
 * Runs fcose synchronously, optionally fits the camera to the final positions, then
 * glides nodes from where they were (or from the middle, on the first run).
 */
function runLayout(cy: Core, opts: { randomize: boolean; animate: boolean; compact?: boolean; fit?: () => void }) {
  const nodes = cy.nodes();
  if (nodes.empty()) return;
  const before = new Map<string, Position>(nodes.map((node) => [node.id(), { ...node.position() }]));
  const options = {
    name: "fcose",
    // "proof" is the nicer layout but costs ~2x; big vaults trade it for a faster first paint.
    // Incremental runs (randomize false) require "proof".
    quality: opts.randomize && nodes.length > LARGE_GRAPH ? "default" : "proof",
    randomize: opts.randomize,
    animate: false,
    fit: false,
    nodeDimensionsIncludeLabels: true,
    // The local graph is a short, wide strip: shorter edges keep its labels legible.
    nodeRepulsion: opts.compact ? 4000 : 6500,
    idealEdgeLength: opts.compact ? 45 : 85,
    nodeSeparation: opts.compact ? 60 : 90,
    gravity: 0.3,
    numIter: 2500,
  } as cytoscape.LayoutOptions;
  const started = performance.now();
  if (opts.randomize) withSeededRandom(() => cy.layout(options).run());
  else cy.layout(options).run();
  if (import.meta.env.DEV) {
    const elapsed = Math.round(performance.now() - started);
    console.debug(`[graph] fcose ${nodes.length} nodes in ${elapsed}ms`);
  }
  const after = new Map<string, Position>(nodes.map((node) => [node.id(), { ...node.position() }]));
  opts.fit?.();
  if (!opts.animate) return;
  const box = nodes.boundingBox({});
  const middle = { x: box.x1 + box.w / 2, y: box.y1 + box.h / 2 };
  cy.batch(() => {
    for (const node of nodes) node.position(opts.randomize ? middle : (before.get(node.id()) ?? middle));
  });
  gliding.set(cy, after);
  const glide = cy.layout({
    name: "preset",
    positions: (node: NodeSingular) => after.get(node.id()) ?? middle,
    animate: true,
    animationDuration: LAYOUT_MS,
    animationEasing: "ease-out-cubic",
    fit: false,
  } as cytoscape.LayoutOptions);
  glide.one("layoutstop", () => {
    if (gliding.get(cy) === after) gliding.delete(cy);
  });
  glide.run();
}

/**
 * Grouped mode reads by structure, not by links: all edges stay veiled except those of
 * the hovered/selected node, whose neighbours are lit and the rest dimmed.
 *
 * A layer box has no useful edges (its members are joined to it by containment), so when
 * the box itself is active its members are lit instead of drawing those edges.
 */
function emphasizeNode(cy: Core, activeId: string | null): void {
  cy.batch(() => {
    cy.edges().addClass("veiled").removeClass("lit");
    cy.nodes().removeClass("fade lit");
    if (!activeId) return;
    const node = cy.getElementById(activeId);
    if (node.empty()) return;
    // Padding and spacer nodes are structure, not members worth highlighting.
    const members = node.isParent() ? node.children().not(":parent, [bandLabel], [spacer]") : null;
    if (members?.nonempty()) {
      members.addClass("lit");
      cy.nodes().not(members).not(":parent, [bandLabel], [spacer]").addClass("fade");
      return;
    }
    // A layer box with no member on screen has no useful edges either.
    if (node.isParent()) return;
    const ring = node.closedNeighborhood();
    ring.addClass("lit");
    cy.nodes().not(ring).not(":parent, [bandLabel], [spacer]").addClass("fade");
    node.connectedEdges().removeClass("veiled").addClass("lit");
  });
}

/** Mirrors `data` into the graph in place; returns how many nodes were added, removed or re-parented. */
function syncElements(cy: Core, data: GraphData, layout: GroupedLayout | null): number {
  const wanted = toElements(data, layout);
  const ids = new Set(wanted.map((element) => element.data.id as string));
  let changed = 0;
  cy.batch(() => {
    cy.elements().forEach((element) => {
      if (ids.has(element.id())) return;
      if (element.isNode()) changed += 1;
      element.remove();
    });
    const nodes = wanted.filter((element) => element.group === "nodes");
    const added: NodeSingular[] = [];
    // Add the parent boxes before their children, so no node ever references a missing parent.
    for (const pass of [false, true]) {
      for (const element of nodes) {
        if (Boolean(element.data.parent) !== pass) continue;
        if (cy.getElementById(element.data.id as string).nonempty()) continue;
        added.push(cy.add(element) as unknown as NodeSingular);
        changed += 1;
      }
    }
    for (const element of nodes) {
      const existing = cy.getElementById(element.data.id as string);
      if (existing.empty() || !existing.isNode()) continue;
      const next = element.data.parent as string | undefined;
      // Parent changes only go through `move`; a `parent` key in `data` is not allowed.
      const patch = { ...element.data };
      delete patch.parent;
      existing.data(patch);
      const current = existing.parent() as NodeSingular;
      if ((current.nonempty() ? current.id() : undefined) === next) continue;
      // `move` is the only supported way to change a compound parent after the fact.
      (existing as NodeSingular).move({ parent: next ?? null });
      changed += 1;
    }
    for (const element of wanted) {
      if (element.group !== "edges") continue;
      const existing = cy.getElementById(element.data.id as string);
      if (existing.empty()) cy.add(element);
      else existing.data(element.data);
    }
    // Grouped mode: an edge to the node's own layer box only repeats containment and would
    // draw a line into the middle of that box, so mark it hidden. Flat mode draws it.
    const boxParents = layout?.parents;
    cy.edges().forEach((edge) => {
      const source = edge.source().id();
      const target = edge.target().id();
      const intra = Boolean(boxParents && (boxParents.get(source) === target || boxParents.get(target) === source));
      edge.toggleClass("intraBox", intra);
    });
    // New nodes start next to the neighbours they already have, so the refresh barely moves.
    for (const node of added) {
      const placed = node.neighborhood("node").filter((other) => !added.includes(other as NodeSingular));
      const anchor = placed.nonempty() ? placed.boundingBox({}) : cy.extent();
      node.position({
        x: anchor.x1 + anchor.w / 2 + (hashJitter(node.id()) - 0.5) * 60,
        y: anchor.y1 + anchor.h / 2 + (hashJitter(`${node.id()}:y`) - 0.5) * 60,
      });
    }
  });
  return changed;
}

export default function GraphCanvas({
  data,
  mode,
  centerId,
  visibleIds = null,
  query = "",
  grouped = true,
  selectedId = null,
  insets = NO_INSETS,
  onNodeClick,
  onBackgroundClick,
  className,
  ref,
}: GraphCanvasProps) {
  const t = useT();
  const reduce = useReducedMotion() ?? false;
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const firstRun = useRef(true);
  const [hover, setHover] = useState<Hover | null>(null);
  const [palette, setPalette] = useState<Palette | null>(null);

  const elements = useMemo(() => (mode === "local" && centerId ? localGraph(data, centerId) : data), [data, mode, centerId]);
  // The editor's local graph is a small strip and stays flat; so does focus mode.
  const boxed = mode === "full" && grouped;

  // Callbacks and options change every render; handlers read the latest through refs.
  const latest = useRef({ onNodeClick, onBackgroundClick, insets, reduce, mode, boxed, selectedId });
  latest.current = { onNodeClick, onBackgroundClick, insets, reduce, mode, boxed, selectedId };
  /** Grouping switched on/off: the picture changes shape, so fit it again. */
  const lastBoxed = useRef(boxed);

  const fitVisible = (animate: boolean) => {
    const cy = cyRef.current;
    if (!cy) return;
    fitTo(cy, cy.elements(":visible"), latest.current.insets, animate && !latest.current.reduce);
  };

  useImperativeHandle(ref, () => ({
    fit: () => fitVisible(true),
    centerOn: (id, opts) => {
      const cy = cyRef.current;
      const node = cy?.getElementById(id);
      if (!cy || !node || node.empty()) return;
      const area = latest.current.insets;
      const right = area.right + (opts?.avoidRight ?? 0);
      const zoom = Math.max(cy.zoom(), 1.1);
      const width = cy.width() - area.left - right;
      const height = cy.height() - area.top - area.bottom;
      const position = node.position();
      const pan = { x: area.left + width / 2 - zoom * position.x, y: area.top + height / 2 - zoom * position.y };
      cy.stop(true);
      if (latest.current.reduce) cy.viewport({ zoom, pan });
      else cy.animate({ zoom, pan }, { duration: CAMERA_MS, easing: "ease-out-cubic" });
    },
  }));

  // Create the instance once; theme changes swap the stylesheet, data changes patch elements.
  // biome-ignore lint/correctness/useExhaustiveDependencies: created once per mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const initialPalette = readPalette();
    const large = data.nodes.length > LARGE_GRAPH;
    const cy = cytoscape({
      container,
      style: buildStyle(initialPalette, reduce),
      minZoom: 0.1,
      maxZoom: 3,
      boxSelectionEnabled: false,
      autounselectify: true,
      textureOnViewport: large,
      hideEdgesOnViewport: large,
      pixelRatio: "auto",
    });
    cyRef.current = cy;
    // Dev (and the Playwright probe) can read positions; production keeps it private.
    if (import.meta.env.DEV || (window as { __BASICS_E2E__?: boolean }).__BASICS_E2E__) {
      (window as { __basicsCy?: Core }).__basicsCy = cy;
    }
    setPalette(initialPalette);

    const hoverFrom = (node: NodeSingular): Hover => {
      const position = node.renderedPosition();
      return {
        id: node.id(),
        title: node.data("title") as string,
        type: node.data("type") as GraphNodeType,
        degree: node.data("degree") as number,
        x: position.x,
        y: position.y,
        radius: (node.renderedWidth() as number) / 2,
      };
    };

    cy.on("mouseover", "node", (event) => {
      const node = event.target as NodeSingular;
      if (node.data("bandLabel") || node.data("spacer")) return;
      if (latest.current.boxed) emphasizeNode(cy, node.id());
      else {
        cy.batch(() => {
          cy.elements().addClass("fade");
          node.closedNeighborhood().removeClass("fade").addClass("lit");
        });
      }
      container.style.cursor = "pointer";
      setHover(hoverFrom(node));
    });
    cy.on("mouseout", "node", () => {
      if (latest.current.boxed) emphasizeNode(cy, latest.current.selectedId ?? null);
      else cy.batch(() => cy.elements().removeClass("fade lit"));
      container.style.cursor = "";
      setHover(null);
    });
    cy.on("viewport", () => {
      toggleDetailLabels(cy);
      setHover((current) => {
        if (!current) return current;
        const node = cy.getElementById(current.id);
        return node.nonempty() ? hoverFrom(node as NodeSingular) : null;
      });
    });
    cy.on("tap", (event) => {
      if (event.target === cy) {
        latest.current.onBackgroundClick?.();
        return;
      }
      const target = event.target as NodeSingular;
      if (target.isNode?.() && !target.data("bandLabel") && !target.data("spacer")) latest.current.onNodeClick?.(target.id());
    });

    // Follow the theme: the provider toggles `.dark` on <html>, so watch the class itself.
    const observer = new MutationObserver(() => setPalette(readPalette()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    // Geist may load after the first paint; redraw labels with the real font.
    void document.fonts?.ready.then(() => {
      if (!cy.destroyed()) cy.style().update();
    });
    const resize = new ResizeObserver(() => cy.resize());
    resize.observe(container);

    return () => {
      observer.disconnect();
      resize.disconnect();
      cy.destroy();
      cyRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!palette) return;
    cyRef.current?.style(buildStyle(palette, reduce));
  }, [palette, reduce]);

  // Patch elements in place; only a structural change re-runs the layout, and the camera
  // only moves on the first run (local graphs re-fit, they are rebuilt per note).
  // biome-ignore lint/correctness/useExhaustiveDependencies: fitVisible only reads refs
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    // Grouped mode gets a computed preset; flat and local graphs keep fcose.
    const layout = boxed
      ? computeGroupedLayout(elements, {
          aspect: cy.width() / Math.max(cy.height(), 1),
          titles: { top: t("graph.bandProfiles"), bottom: t("graph.bandCrossLayer") },
        })
      : null;
    const changed = syncElements(cy, elements, layout);
    const first = firstRun.current;
    firstRun.current = false;
    // StrictMode mounts, destroys and remounts the instance: a fresh one needs its first fit.
    const freshInstance = cy.nodes().nonempty() && !laidOut.has(cy);
    if (cy.nodes().nonempty()) laidOut.add(cy);
    const boxedChanged = lastBoxed.current !== boxed;
    lastBoxed.current = boxed;
    if (!first && changed === 0 && !boxedChanged && !freshInstance) return;
    const animate = !reduce;
    if (mode === "local") {
      cy.nodes().removeStyle("font-size");
      runLayout(cy, { randomize: true, animate: false, compact: true, fit: () => fitVisible(false) });
      return;
    }
    if (layout) {
      runPresetLayout(cy, layout);
      if (first || boxedChanged || freshInstance) fitVisible(false);
      else scaleLabelsToFit(cy, cy.zoom());
      toggleDetailLabels(cy);
      emphasizeNode(cy, latest.current.selectedId ?? null);
      return;
    }
    cy.nodes().removeStyle("font-size");
    runLayout(cy, {
      randomize: freshInstance,
      animate,
      fit: first || boxedChanged || freshInstance ? () => fitVisible(false) : undefined,
    });
  }, [elements, mode, reduce, boxed, t]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-apply after the elements sync
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const inView = (id: string) => visibleIds === null || visibleIds.has(id);
    cy.batch(() => {
      // Members first: a hidden layer box disappears together with its members.
      cy.nodes()
        .not(":parent, [bandLabel], [spacer]")
        .forEach((node) => {
          const parent = node.parent() as NodeSingular;
          const parentHidden = parent.nonempty() && !inView(parent.id());
          node.toggleClass("gone", !inView(node.id()) || parentHidden);
        });
      // Empty boxes disappear, and a layer with no member in this data set is not a box.
      cy.nodes(":parent").forEach((node) => {
        const box = node.children().not("[spacer]").not(".gone").nonempty();
        node.toggleClass("gone", !inView(node.id()) || (boxed && !box));
      });
      // Spacers only exist to reserve header room; they follow their box.
      cy.nodes("[spacer]").forEach((node) => {
        const parent = node.parent() as NodeSingular;
        node.toggleClass("gone", parent.empty() || parent.hasClass("gone"));
      });
      // A layer note without members is not a box: hide it in grouped mode.
      cy.nodes('[type = "layer"]').forEach((node) => {
        if (node.isParent()) return;
        node.toggleClass("gone", !inView(node.id()) || boxed);
      });
      // Band headers stay only while the band has something to show.
      cy.nodes("[bandLabel]").forEach((node) => {
        const band = node.data("band") as "top" | "bottom";
        const anyVisible = cy.nodes(`[band = "${band}"]`).not("[bandLabel]").not(".gone").not(":parent").nonempty();
        node.toggleClass("gone", !anyVisible);
      });
    });
  }, [elements, visibleIds, boxed]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const hits = new Set(matchNodes(elements.nodes, query).map((node) => node.id));
    const searching = query.trim().length > 0;
    cy.batch(() => {
      cy.elements().removeClass("dim hit");
      if (!searching) return;
      cy.nodes().forEach((node) => {
        node.addClass(hits.has(node.id()) ? "hit" : "dim");
      });
      // Boxes and band headers are structure, not search results.
      cy.nodes(":parent, [bandLabel], [spacer]").removeClass("dim hit");
      cy.edges().addClass("dim");
    });
  }, [elements, query]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-apply after the elements sync
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const picked = selectedId ?? (mode === "local" ? centerId : null);
    cy.batch(() => {
      cy.nodes(".picked").removeClass("picked");
      if (picked) cy.getElementById(picked).addClass("picked");
    });
    if (boxed) emphasizeNode(cy, picked ?? null);
    else cy.batch(() => cy.elements().removeClass("fade lit veiled"));
  }, [elements, selectedId, mode, centerId, boxed]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        ref={containerRef}
        data-testid={mode === "full" ? "graph-canvas" : "local-graph-canvas"}
        role="img"
        aria-label={t("graph.canvas", { nodes: elements.nodes.length, edges: elements.edges.length })}
        className="h-full w-full"
      />
      <AnimatePresence>
        {hover && (
          <motion.div
            key={hover.id}
            initial={{ opacity: 0, y: reduce ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.08 } }}
            transition={{ duration: 0.14, ease: EASE_OUT }}
            aria-hidden="true"
            className="pointer-events-none absolute z-10"
            style={{ left: hover.x + hover.radius + 10, top: hover.y }}
          >
            <div className="-translate-y-1/2 rounded-xl border border-border bg-popover/90 px-2.5 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-md">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: palette?.types[hover.type] ?? `var(--type-${hover.type})` }}
                />
                {t(`type.${hover.type}` as TranslationKey)}
                <span className="opacity-50">·</span>
                {t("graph.connections", { count: hover.degree })}
              </div>
              <div className="max-w-56 truncate text-[13px] font-semibold tracking-tight text-popover-foreground">{hover.title}</div>
              <div className="max-w-56 truncate font-mono text-[10.5px] text-muted-foreground">{hover.id}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
