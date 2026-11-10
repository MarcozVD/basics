import type { GraphData, GraphNodeType } from "@marcozvd/basics-core";
import cytoscape, { type Core, type ElementDefinition, type NodeSingular, type Position, type StylesheetJson } from "cytoscape";
import fcose from "cytoscape-fcose";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type Dispatch, type Ref, type SetStateAction, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { type TranslationKey, useT } from "@/i18n";
import { EASE_OUT } from "@/lib/ease";
import { currentNavigationEpoch, onNavigationIntent } from "@/lib/page-transition";
import { cn } from "@/lib/utils";
import { type GraphCacheScope, type GraphPosition, recallGraph, rememberCamera, rememberGraph } from "./graph-cache";
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
import { type GraphPerfMount, perfCount, perfFirstFrame, perfMount, perfPhase, perfSettled } from "./graph-perf";
import { computeRingLayout, type RingLayout } from "./graph-rings";

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
  /** Move keyboard focus onto the canvas, as the search field's second Escape does. */
  focus: () => void;
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
  /** Where to restore the previous positions and camera from (full graph only). */
  cacheScope?: GraphCacheScope | null;
  /**
   * The navigation the page was entered with. The canvas may mount a few hundred
   * milliseconds later (chunk, data), after the reader already left; deferred boot steps
   * compare against this, not their own mount, so a late mount during the exit does not
   * start a layout for a page that is on its way out.
   */
  navigationEpoch?: number;
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
/** Zoomed out past this, a big graph draws only the labels of its best-connected nodes. */
const CULL_ZOOM = 0.6;
/** How many labels survive that culling. */
const CULL_KEEP = 80;
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

function buildStyle(palette: Palette): StylesheetJson {
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
      // Zoomed out far, most labels are a smear of pixels: only the hubs keep theirs, so
      // panning a big graph does not rasterise a thousand text runs.
      selector: "node.cull",
      style: { "text-opacity": 0 },
    },
    {
      // Hover, hit and selection still name the node, culled or not.
      selector: "node.cull.lit, node.cull.picked, node.cull.hit",
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
    {
      // Ordinary Cytoscape geometry: the renderer handles zoom/pan with no overlay loop.
      // Decorative circles must never cover edges or intercept the empty canvas.
      selector: "node[ringGuide]",
      style: {
        shape: "ellipse",
        "background-opacity": 0,
        "border-width": 1.5,
        "border-color": palette.foreground,
        "border-opacity": 0.12,
        label: "",
        events: "no",
        "text-events": "no",
        "z-index": -1,
        "z-index-compare": "manual",
        "z-compound-depth": "bottom",
      },
    },
  ];
}

function truncateLabel(title: string): string {
  return title.length > LABEL_TRUNCATE ? `${title.slice(0, LABEL_TRUNCATE - 1)}…` : title;
}

function toElements(data: GraphData, layout: GroupedLayout | null, rings: RingLayout | null): ElementDefinition[] {
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
    ...(rings?.rings ?? []).map((ring) => ({
      group: "nodes" as const,
      data: { id: `ring-guide:${ring.band}`, ringGuide: 1, members: ring.ids, size: ring.radius * 2, label: "", degree: 0 },
      position: { x: 0, y: 0 },
      locked: true,
      selectable: false,
      grabbable: false,
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

/**
 * Everything the instance's own handlers need to read, refreshed on every render. A kept
 * instance outlives its React tree, so it cannot close over one mount's refs: it holds this
 * object and the mounted canvas writes the current callbacks and options into it.
 */
interface CanvasBridge {
  onNodeClick?: (id: string) => void;
  onBackgroundClick?: () => void;
  insets: Insets;
  reduce: boolean;
  boxed: boolean;
  selectedId: string | null;
  cache: GraphCacheScope | null;
  /** The div the canvas is currently attached to (null while detached). */
  container: HTMLDivElement | null;
  setHover: Dispatch<SetStateAction<Hover | null>>;
  setPalette: Dispatch<SetStateAction<Palette | null>>;
}

/**
 * The full graph keeps its cytoscape instance between visits to `/graph`. Building one and
 * painting a large vault costs 150–300 ms of native canvas work before the first frame, so
 * a stable shell is detached on unmount and re-attached on the next mount: the browser keeps
 * the canvas, and coming back shows the same picture without a layout.
 *
 * The shell must be the cytoscape container's parent and the container itself must never be
 * removed: cytoscape watches its container's parent and destroys its renderer when the
 * container leaves the DOM, leaving a live core that never paints again.
 */
interface PersistentCanvas {
  cy: Core;
  /** An open batch suspends the detached renderer's draw and texture-cache queues. */
  suspended: boolean;
  /** Stable parent of the cytoscape container: detaching this never detaches `cy`'s own container. */
  shell: HTMLDivElement;
  bridge: CanvasBridge;
  /** Stylesheet already applied, so a return does not rebuild one that still matches. */
  style: { palette: Palette };
  /** The exact data object mirrored into `cy`; a different one goes through `syncElements`. */
  dataRef: GraphData | null;
  /** Grouping plus the band titles `cy` was synced with; a change forces a re-sync. */
  layoutKey: string;
  /** The label metrics were recalculated with the real font. */
  fontsApplied: boolean;
  /** The last elements effect found the picture already mirrored in `cy`. */
  unchanged: boolean;
  /** Inputs of the class work that has already been applied to this picture. */
  appliedVisibility: { ids: Set<string> | null; boxed: boolean } | null;
  appliedQuery: string | null;
  appliedSelection?: string | null;
}

/** At most two retained views; local graphs remain scoped to the editor mount. */
const fullCanvases = new Map<boolean, PersistentCanvas>();

function createBridge(): CanvasBridge {
  return {
    insets: NO_INSETS,
    reduce: false,
    boxed: true,
    selectedId: null,
    cache: null,
    container: null,
    setHover: () => {},
    setPalette: () => {},
  };
}

function samePalette(a: Palette, b: Palette): boolean {
  return (
    a.foreground === b.foreground &&
    a.muted === b.muted &&
    a.surface === b.surface &&
    a.background === b.background &&
    a.border === b.border &&
    a.borderOpacity === b.borderOpacity &&
    a.broken === b.broken &&
    GRAPH_TYPES.every((type) => a.types[type] === b.types[type])
  );
}

/** What the cache stores: every node drawn on its own (compound boxes follow their members). */
function snapshotPositions(cy: Core): Record<string, GraphPosition> {
  // Mid-glide the nodes are between two pictures; store where they are heading.
  const targets = gliding.get(cy);
  const positions: Record<string, GraphPosition> = {};
  cy.nodes().forEach((node) => {
    if (node.isParent() || node.data("ringGuide")) return;
    const position = targets?.get(node.id()) ?? node.position();
    positions[node.id()] = { x: Math.round(position.x * 100) / 100, y: Math.round(position.y * 100) / 100 };
  });
  return positions;
}

/** Positions plus camera of the picture on screen, for the next visit. */
function rememberGraphState(cy: Core, scope: GraphCacheScope | null): void {
  if (!scope || cy.destroyed()) return;
  rememberGraph(scope, snapshotPositions(cy), { zoom: cy.zoom(), pan: { ...cy.pan() } });
}

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
  toggleLabelCulling(cy);
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

/** Practice and check labels follow the same threshold; rewriting them on every pan is wasteful. */
const detailLabelsShown = new WeakMap<Core, boolean>();

/**
 * Practice and check titles are noise at the fit zoom: they join the tech labels only
 * once the reader zooms past `DETAIL_LABEL_ZOOM` (hover and selection still show them).
 */
function toggleDetailLabels(cy: Core): void {
  const show = cy.zoom() >= DETAIL_LABEL_ZOOM;
  if (detailLabelsShown.get(cy) === show) return;
  detailLabelsShown.set(cy, show);
  cy.batch(() => {
    cy.nodes('[type = "practice"], [type = "check"]').toggleClass("zoomed", show);
  });
}

/** Labels that survive zooming out: the best-connected nodes, computed once per picture. */
const keptLabels = new WeakMap<Core, Set<string>>();
/** Whether the instance is currently drawing only those labels. */
const cullingLabels = new WeakMap<Core, boolean>();
/** Decorative geometry must not change the culling threshold or add a viewport scan. */
const ringGuideCounts = new WeakMap<Core, number>();

function labelKeepSet(cy: Core): Set<string> {
  const cached = keptLabels.get(cy);
  if (cached) return cached;
  const ranked = cy
    .nodes()
    .not(":parent, [bandLabel], [spacer], [ringGuide]")
    .toArray()
    .sort((a, b) => (b.data("degree") as number) - (a.data("degree") as number) || a.id().localeCompare(b.id()));
  const keep = new Set(ranked.slice(0, CULL_KEEP).map((node) => node.id()));
  keptLabels.set(cy, keep);
  return keep;
}

/**
 * Zoomed out, most labels are illegible dots of ink: only the hubs keep theirs. Below
 * `LARGE_GRAPH` nodes every label fits, so a normal vault keeps its picture untouched.
 * The class is only rewritten when the threshold is crossed, so panning costs nothing.
 */
function toggleLabelCulling(cy: Core): void {
  const cull = cy.zoom() < CULL_ZOOM && cy.nodes().length - (ringGuideCounts.get(cy) ?? 0) > LARGE_GRAPH;
  if (cullingLabels.get(cy) === cull) return;
  cullingLabels.set(cy, cull);
  const keep = cull ? labelKeepSet(cy) : null;
  cy.batch(() => {
    cy.nodes()
      .not(":parent, [bandLabel], [spacer], [ringGuide]")
      .forEach((node) => {
        node.toggleClass("cull", keep !== null && !keep.has(node.id()));
      });
  });
}

/**
 * Deterministic grouped layout: positions come from `computeGroupedLayout`; no force
 * simulation runs, so first paint is instant and identical between visits.
 */
function runPresetLayout(cy: Core, layout: GroupedLayout): void {
  perfCount("layouts");
  perfCount("presets");
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
 * Moves every node to its settled position. Without animation the picture jumps straight
 * there (reduced motion); with it the nodes glide from where they are, and a fit issued
 * meanwhile aims at where they are heading.
 */
function settleTo(cy: Core, targets: Map<string, Position>, opts: { animate: boolean; fit?: () => void; onSettled?: () => void }): void {
  const nodes = cy.nodes();
  if (nodes.empty()) {
    opts.fit?.();
    opts.onSettled?.();
    return;
  }
  if (!opts.animate) {
    cy.batch(() => {
      for (const node of nodes) {
        const target = targets.get(node.id());
        if (target) node.position(target);
      }
    });
    opts.fit?.();
    opts.onSettled?.();
    return;
  }
  perfCount("glides");
  const box = nodes.boundingBox({});
  const middle = { x: box.x1 + box.w / 2, y: box.y1 + box.h / 2 };
  const before = new Map<string, Position>(nodes.map((node) => [node.id(), { ...node.position() }]));
  gliding.set(cy, targets);
  // A fit issued now aims at the settled picture (`settledBox` reads the glide targets).
  opts.fit?.();
  const glide = cy.layout({
    name: "preset",
    positions: (node: NodeSingular) => targets.get(node.id()) ?? middle,
    animate: true,
    animationDuration: LAYOUT_MS,
    animationEasing: "ease-out-cubic",
    fit: false,
  } as cytoscape.LayoutOptions);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    // A newer picture may have taken over while this one was animating.
    if (gliding.get(cy) !== targets) return;
    gliding.delete(cy);
    if (!cy.destroyed()) {
      cy.batch(() => {
        for (const node of nodes) {
          const target = targets.get(node.id());
          if (target) node.position(target);
        }
      });
    }
    opts.onSettled?.();
  };
  glide.one("layoutstop", finish);
  // A canvas that was detached and re-attached stops running animations, and a fit can stop
  // them too: the picture has to land anyway, so the glide gets a deadline.
  setTimeout(finish, LAYOUT_MS + 200);
  cy.batch(() => {
    for (const node of nodes) node.position(before.get(node.id()) ?? middle);
  });
  glide.run();
}

/**
 * Runs the editor's compact fcose layout synchronously, then fits the local graph.
 */
function runLayout(cy: Core, opts: { randomize: boolean; animate: boolean; compact?: boolean; fit?: () => void; onSettled?: () => void }) {
  const nodes = cy.nodes();
  if (nodes.empty()) return;
  perfCount("layouts");
  perfCount("fcose");
  const options = {
    name: "fcose",
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
  settleTo(cy, after, { animate: opts.animate, onSettled: opts.onSettled });
}

interface HighlightState {
  lit: Set<string>;
  fade: Set<string>;
  veiled: Set<string>;
}

const EMPTY_HIGHLIGHT: HighlightState = { lit: new Set(), fade: new Set(), veiled: new Set() };
/** The classes each instance currently carries, so a hover only touches the delta. */
const highlightStates = new WeakMap<Core, HighlightState>();

function isStructureNode(node: NodeSingular): boolean {
  return node.isParent() || Boolean(node.data("bandLabel")) || Boolean(node.data("spacer")) || Boolean(node.data("ringGuide"));
}

/**
 * Grouped mode reads by structure, not by links: all edges stay veiled except those of
 * the hovered/selected node, whose neighbours are lit and the rest dimmed.
 *
 * A layer box has no useful edges (its members are joined to it by containment), so when
 * the box itself is active its members are lit instead of drawing those edges.
 */
function highlightTargets(cy: Core, activeId: string | null, boxed: boolean): HighlightState {
  const lit = new Set<string>();
  const fade = new Set<string>();
  const veiled = new Set<string>();
  const found = activeId ? cy.getElementById(activeId) : null;
  const active = found?.nonempty() && found.isNode() ? (found as NodeSingular) : null;

  if (!boxed) {
    if (!active) return { lit, fade, veiled };
    active.closedNeighborhood().forEach((element) => {
      lit.add(element.id());
    });
    cy.elements().forEach((element) => {
      if (element.isNode() && element.data("ringGuide")) return;
      if (!lit.has(element.id())) fade.add(element.id());
    });
    return { lit, fade, veiled };
  }

  cy.edges().forEach((edge) => {
    veiled.add(edge.id());
  });
  if (!active) return { lit, fade, veiled };

  if (active.isParent()) {
    const members = active.children().not(":parent, [bandLabel], [spacer]");
    if (members.empty()) return { lit, fade, veiled };
    members.forEach((member) => {
      lit.add(member.id());
    });
    cy.nodes().forEach((other) => {
      if (lit.has(other.id()) || isStructureNode(other)) return;
      fade.add(other.id());
    });
    return { lit, fade, veiled };
  }

  active.closedNeighborhood().forEach((element) => {
    lit.add(element.id());
    veiled.delete(element.id());
  });
  cy.nodes().forEach((other) => {
    if (lit.has(other.id()) || isStructureNode(other)) return;
    fade.add(other.id());
  });
  return { lit, fade, veiled };
}

const HIGHLIGHT_CLASSES = ["lit", "fade", "veiled"] as const;

/** Applies only the classes whose target state changed since the last call. */
function applyHighlight(cy: Core, activeId: string | null, boxed: boolean): void {
  const next = highlightTargets(cy, activeId, boxed);
  const previous = highlightStates.get(cy) ?? EMPTY_HIGHLIGHT;
  cy.batch(() => {
    for (const name of HIGHLIGHT_CLASSES) {
      for (const id of previous[name]) {
        if (next[name].has(id)) continue;
        const element = cy.getElementById(id);
        if (element.nonempty()) element.removeClass(name);
      }
      for (const id of next[name]) {
        if (previous[name].has(id)) continue;
        const element = cy.getElementById(id);
        if (element.nonempty()) element.addClass(name);
      }
    }
  });
  highlightStates.set(cy, next);
}

/** Mirrors `data` into the graph in place; returns how many nodes were added, removed or re-parented. */
function syncElements(cy: Core, data: GraphData, layout: GroupedLayout | null, rings: RingLayout | null): number {
  ringGuideCounts.set(cy, rings?.rings.length ?? 0);
  const wanted = toElements(data, layout, rings);
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
      if (node.data("ringGuide")) continue;
      const placed = node.neighborhood("node").filter((other) => !added.includes(other as NodeSingular));
      const anchor = placed.nonempty() ? placed.boundingBox({}) : cy.extent();
      node.position({
        x: anchor.x1 + anchor.w / 2 + (hashJitter(node.id()) - 0.5) * 60,
        y: anchor.y1 + anchor.h / 2 + (hashJitter(`${node.id()}:y`) - 0.5) * 60,
      });
    }
  });
  // The keep set and the class state belong to the node set that is now gone.
  keptLabels.delete(cy);
  cullingLabels.delete(cy);
  detailLabelsShown.delete(cy);
  // The classes belong to the node set that is now gone; start the next pass from clean.
  highlightStates.delete(cy);
  cy.batch(() => cy.elements().removeClass("fade lit veiled"));
  return changed;
}

/**
 * The tooltip keeps its own state so a hover re-renders this small subtree, never the
 * 1600-line canvas that owns the cytoscape instance.
 */
function GraphHoverTooltip({ bridge, palette }: { bridge: CanvasBridge; palette: Palette | null }) {
  const t = useT();
  const reduce = useReducedMotion() ?? false;
  const [hover, setHover] = useState<Hover | null>(null);
  // The instance handlers read this through the bridge; a new mount replaces it.
  bridge.setHover = setHover;
  useEffect(() => {
    return () => {
      if (bridge.setHover === setHover) bridge.setHover = () => {};
    };
  }, [bridge]);

  return (
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
          <div className="-translate-y-1/2 rounded-xl border border-border bg-popover px-2.5 py-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.18)]">
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
            <div className="max-w-56 truncate font-mono text-[11px] text-muted-foreground">{hover.id}</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GraphCanvasInstance({
  data,
  mode,
  centerId,
  visibleIds = null,
  query = "",
  grouped = true,
  selectedId = null,
  insets = NO_INSETS,
  cacheScope = null,
  navigationEpoch,
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
  /** The navigation this mount belongs to; deferred boot steps bail if the shell has moved on. */
  const mountEpoch = useRef(navigationEpoch ?? currentNavigationEpoch());
  /** The bridge this mount writes into; shared with the kept instance on a return. */
  const bridgeRef = useRef<CanvasBridge | null>(null);
  /** Per-mount timing record; null outside dev and the Playwright probe. */
  const perfRecord = useRef<GraphPerfMount | null>(null);
  /** The frame scheduled between the element sync and the placement, if any. */
  const placeFrame = useRef<number | null>(null);
  /** A frame with this mount's picture has reached the screen. */
  const painted = useRef(false);
  /** The click that leaves this route already dropped the unpainted instance. */
  const abandoned = useRef(false);
  const [palette, setPalette] = useState<Palette | null>(null);
  // Creating the instance and feeding it elements are two heavy steps; let the first one
  // paint before the second starts, so the canvas boot is not one long blocked task.
  const [elementsReady, setElementsReady] = useState(false);

  const elements = useMemo(() => (mode === "local" && centerId ? localGraph(data, centerId) : data), [data, mode, centerId]);
  // The editor's local graph keeps its compact force layout.
  const boxed = mode === "full" && grouped;
  let persistent = mode === "full" ? (fullCanvases.get(boxed) ?? null) : null;

  // Callbacks and options change every render; handlers read the latest through the bridge.
  // A kept instance already closed over the bridge of the mount that created it, so this
  // mount writes into that same object instead of starting a new one.
  if (mode === "full" && persistent && !persistent.cy.destroyed() && !bridgeRef.current) {
    bridgeRef.current = persistent.bridge;
  }
  if (!bridgeRef.current) bridgeRef.current = createBridge();
  const bridge = bridgeRef.current;
  bridge.onNodeClick = onNodeClick;
  bridge.onBackgroundClick = onBackgroundClick;
  bridge.insets = insets;
  bridge.reduce = reduce;
  bridge.boxed = boxed;
  bridge.selectedId = selectedId;
  bridge.cache = cacheScope;
  bridge.setPalette = setPalette;
  /** Grouping switched on/off: the picture changes shape, so fit it again. */
  const lastBoxed = useRef(boxed);

  const fitVisible = (animate: boolean) => {
    const cy = cyRef.current;
    if (!cy) return;
    fitTo(cy, cy.elements(":visible"), bridge.insets, animate && !bridge.reduce);
  };

  /** This mount's picture is on screen: from here on leaving keeps the canvas instead of dropping a boot. */
  const markPainted = () => {
    painted.current = true;
    perfFirstFrame(perfRecord.current);
  };

  useImperativeHandle(ref, () => ({
    fit: () => fitVisible(true),
    focus: () => containerRef.current?.focus(),
    centerOn: (id, opts) => {
      const cy = cyRef.current;
      const node = cy?.getElementById(id);
      if (!cy || !node || node.empty()) return;
      const area = bridge.insets;
      const right = area.right + (opts?.avoidRight ?? 0);
      const zoom = Math.max(cy.zoom(), 1.1);
      const width = cy.width() - area.left - right;
      const height = cy.height() - area.top - area.bottom;
      const position = node.position();
      const pan = { x: area.left + width / 2 - zoom * position.x, y: area.top + height / 2 - zoom * position.y };
      cy.stop(true);
      if (bridge.reduce) cy.viewport({ zoom, pan });
      else cy.animate({ zoom, pan }, { duration: CAMERA_MS, easing: "ease-out-cubic" });
    },
  }));

  // Create the instance once; theme changes swap the stylesheet, data changes patch elements.
  // The full graph keeps its instance between visits: a return re-attaches the same host
  // instead of building a canvas and painting every node again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: created once per mount
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // The page was left while the canvas chunk was still loading: this effect is about to be
    // torn down with the page. Building the renderer here would sync hundreds of elements and
    // paint the whole picture inside the next page's frames; a return rebuilds from the cache.
    if (mode === "full" && currentNavigationEpoch() !== mountEpoch.current) return;
    bridge.container = container;
    const initialPalette = readPalette();
    const large = data.nodes.length > LARGE_GRAPH;
    perfRecord.current = perfMount(mode, elements.nodes.length, elements.edges.length);
    const createStart = performance.now();
    const kept = mode === "full" && persistent && !persistent.cy.destroyed() ? persistent : null;
    let cy: Core;
    if (kept) {
      cy = kept.cy;
      // Hover belongs to the previous visit. Reset it before the retained canvas can paint.
      applyHighlight(cy, bridge.selectedId, bridge.boxed);
      container.appendChild(kept.shell);
      if (kept.suspended) {
        kept.suspended = false;
        cy.endBatch();
      }
      // The instance still holds the picture and the camera it was left with.
      firstRun.current = false;
      // It already reached the screen on an earlier visit; leaving again must keep it.
      painted.current = true;
      perfCount("reuses");
      // Its container was detached for a while. The ResizeObserver below compares the kept
      // canvas box with the live one; a redundant resize here would repaint the whole renderer
      // on the click that returns to the page.
    } else {
      // Two nested divs: `shell` is what the page attaches and detaches, `host` is the
      // cytoscape container inside it. Moving the shell never removes `host` from its parent,
      // so cytoscape keeps its renderer alive between visits.
      const shell = document.createElement("div");
      shell.className = "h-full w-full";
      const host = document.createElement("div");
      host.className = "h-full w-full";
      shell.appendChild(host);
      container.appendChild(shell);
      cy = cytoscape({
        container: host,
        style: buildStyle(initialPalette),
        minZoom: 0.1,
        maxZoom: 3,
        boxSelectionEnabled: false,
        autounselectify: true,
        textureOnViewport: large,
        hideEdgesOnViewport: large,
        pixelRatio: "auto",
      });
      if (mode === "full") {
        persistent = {
          cy,
          suspended: false,
          shell,
          bridge,
          style: { palette: initialPalette },
          dataRef: null,
          layoutKey: "",
          fontsApplied: false,
          unchanged: false,
          appliedVisibility: null,
          appliedQuery: null,
          appliedSelection: undefined,
        };
        fullCanvases.set(boxed, persistent);
      }
    }
    cyRef.current = cy;
    perfPhase(perfRecord.current, kept ? "reattach" : "create", performance.now() - createStart);
    // Dev (and the Playwright probe) can read positions; production keeps it private.
    if (import.meta.env.DEV || (window as { __BASICS_E2E__?: boolean }).__BASICS_E2E__) {
      (window as { __basicsCy?: Core }).__basicsCy = cy;
    }
    setPalette(initialPalette);

    // The element sync has queued cytoscape's first full render (or is about to). A link click
    // that leaves this route is the last moment early enough to cancel it: destroying the
    // unpainted instance inside the click drops the queued frame before it lands in the next
    // page's budget. A picture that already painted is kept for the next visit instead.
    const abandonBoot = () => {
      if (abandoned.current || painted.current || mode !== "full") return;
      if (currentNavigationEpoch() === mountEpoch.current) return;
      abandoned.current = true;
      if (placeFrame.current !== null) {
        cancelAnimationFrame(placeFrame.current);
        placeFrame.current = null;
      }
      if (bridge.cache) rememberCamera(bridge.cache, { zoom: cy.zoom(), pan: { ...cy.pan() } });
      cy.destroy();
      if (persistent?.cy === cy) persistent = null;
      fullCanvases.delete(boxed);
      cyRef.current = null;
    };
    const unsubscribeIntent = onNavigationIntent(abandonBoot);

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

    /**
     * Pointer events arrive in bursts: an out and an in for the next node usually share a
     * frame. Keep only the latest target and apply it once, so moving between two nodes is
     * one highlight change instead of a clear followed by a re-apply.
     */
    let pendingHover: string | null | undefined;
    let hoverFrame: number | null = null;
    const flushHover = () => {
      hoverFrame = null;
      if (pendingHover === undefined) return;
      const id = pendingHover;
      pendingHover = undefined;
      // Leaving a node restores the grouped selection; flat mode clears every highlight.
      applyHighlight(cy, id ?? (bridge.boxed ? bridge.selectedId : null), bridge.boxed);
      if (!id) {
        bridge.setHover(null);
        return;
      }
      const node = cy.getElementById(id);
      bridge.setHover(node.nonempty() && node.isNode() ? hoverFrom(node as NodeSingular) : null);
    };
    const scheduleHover = (id: string | null) => {
      pendingHover = id;
      if (hoverFrame === null) hoverFrame = requestAnimationFrame(flushHover);
    };

    // Hover frames belong to this mount so its cleanup can cancel every pending update.
    const onMouseOver = (event: cytoscape.EventObject) => {
      const node = event.target as NodeSingular;
      if (node.data("bandLabel") || node.data("spacer") || node.data("ringGuide")) return;
      if (bridge.container) bridge.container.style.cursor = "pointer";
      scheduleHover(node.id());
    };
    const onMouseOut = () => {
      if (bridge.container) bridge.container.style.cursor = "";
      scheduleHover(null);
    };
    cy.on("mouseover", "node", onMouseOver);
    cy.on("mouseout", "node", onMouseOut);
    // Other handlers read the shared bridge and need only one binding per instance.
    if (!kept) {
      cy.on("viewport", () => {
        toggleDetailLabels(cy);
        toggleLabelCulling(cy);
        const scope = bridge.cache;
        if (scope) rememberCamera(scope, { zoom: cy.zoom(), pan: { ...cy.pan() } });
        if (!bridge.container) return;
        bridge.setHover((current) => {
          if (!current) return current;
          const node = cy.getElementById(current.id);
          return node.nonempty() ? hoverFrom(node as NodeSingular) : null;
        });
      });
      cy.on("tap", (event) => {
        if (event.target === cy) {
          bridge.onBackgroundClick?.();
          return;
        }
        const target = event.target as NodeSingular;
        if (target.isNode?.() && !target.data("bandLabel") && !target.data("spacer") && !target.data("ringGuide"))
          bridge.onNodeClick?.(target.id());
      });
      // Geist may load after the first paint; redraw labels with the real font. A ready
      // promise that resolves after the page was left must not restyle a detached canvas:
      // that recalculated every label and repainted the whole graph inside the next page's
      // frame. The skip leaves `fontsApplied` false, so the next visit applies it instead.
      const applyFontStyle = () => {
        if (cy.destroyed()) return;
        cy.style().update();
        if (persistent?.cy === cy) persistent.fontsApplied = true;
      };
      void document.fonts?.ready.then(() => {
        if (cy.destroyed() || !bridge.container) return;
        if (mode === "full" && currentNavigationEpoch() !== mountEpoch.current) return;
        applyFontStyle();
      });
    } else if (!kept.fontsApplied) {
      // A kept instance whose font pass was skipped while it was detached: apply it when Geist
      // is ready, once, and only while it is still attached.
      void document.fonts?.ready.then(() => {
        if (cy.destroyed() || !bridge.container || kept.fontsApplied) return;
        if (mode === "full" && currentNavigationEpoch() !== mountEpoch.current) return;
        cy.style().update();
        kept.fontsApplied = true;
      });
    }

    // Follow the theme: the provider toggles `.dark` on <html>, so watch the class itself.
    const observer = new MutationObserver(() => bridge.setPalette(readPalette()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    // A re-attached canvas keeps its size unless the window (or the page chrome) changed it.
    const resize = new ResizeObserver(() => {
      if (Math.abs(cy.width() - container.clientWidth) < 1 && Math.abs(cy.height() - container.clientHeight) < 1) return;
      cy.resize();
    });
    resize.observe(container);

    return () => {
      observer.disconnect();
      resize.disconnect();
      unsubscribeIntent();
      cy.off("mouseover", "node", onMouseOver);
      cy.off("mouseout", "node", onMouseOut);
      if (hoverFrame !== null) {
        cancelAnimationFrame(hoverFrame);
        hoverFrame = null;
      }
      pendingHover = undefined;
      bridge.container = null;
      cyRef.current = null;
      // The leaving click already dropped this unpainted instance and its queued render.
      if (abandoned.current) return;
      // Leaving the page must abandon the boot: a pending placement or a
      // glide that outlives the mount would block the next page on the main thread.
      if (persistent?.cy === cy) {
        // stop() requests a renderer redraw even when nothing is animating. Avoid
        // repainting a detached picture on the frame that shows the other mode.
        if (cy.animated()) cy.stop(true);
        if (gliding.has(cy)) cy.elements().stop();
        gliding.delete(cy);
        // A boot that never painted a frame has no picture worth keeping, and its queued
        // element sync, font restyle or first full render would otherwise run inside the
        // next page's frames. Dropping it is the only way to cancel cytoscape's own render
        // loop; the next visit rebuilds from the position cache.
        if (!painted.current) {
          if (bridge.cache) rememberCamera(bridge.cache, { zoom: cy.zoom(), pan: { ...cy.pan() } });
          cy.destroy();
          persistent = null;
          fullCanvases.delete(boxed);
          return;
        }
        rememberGraphState(cy, bridge.cache);
        persistent.appliedSelection = undefined;
        // Cytoscape's render loop skips drawing and texture/style queue work while
        // batching. Resume the retained view only when its shell is attached again.
        cy.startBatch();
        persistent.suspended = true;
        persistent.shell.remove();
        return;
      }
      // Going away for good: stop the simulation instead of paying for a picture no one sees.
      cy.destroy();
    };
  }, []);

  // One frame between building the renderer and adding the picture: the empty canvas box
  // paints first, then the element sync and layout run in their own task.
  useEffect(() => {
    const raf = requestAnimationFrame(() => setElementsReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (!palette) return;
    const cy = cyRef.current;
    if (!cy) return;
    // A kept instance keeps the stylesheet it already has, unless the theme changed.
    const applied = persistent?.cy === cy ? persistent.style : null;
    if (applied && samePalette(applied.palette, palette)) return;
    if (persistent?.cy === cy) persistent.style = { palette };
    const started = performance.now();
    cy.style(buildStyle(palette));
    perfPhase(perfRecord.current, "stylesheet", performance.now() - started);
  }, [palette, persistent]);

  // Patch elements in place; only a structural change re-runs the layout, and the camera
  // only moves on the first run (local graphs re-fit, they are rebuilt per note).
  // biome-ignore lint/correctness/useExhaustiveDependencies: fitVisible only reads refs
  useEffect(() => {
    if (!elementsReady) return;
    const cy = cyRef.current;
    if (!cy) return;
    // The shell left this page while the canvas was still booting: skip the heavy sync so it
    // cannot land in the next page's frame. The camera was kept by the cleanup; a return rebuilds.
    if (mode === "full" && currentNavigationEpoch() !== mountEpoch.current) return;
    const effectStart = performance.now();
    const titles = { top: t("graph.bandProfiles"), bottom: t("graph.bandCrossLayer") };
    // What the grouped picture depends on besides the data itself.
    const layoutKey = boxed ? `grouped|${titles.top}|${titles.bottom}` : "flat";
    // Back on the picture the kept instance still holds: no sync, no layout, same camera.
    const unchanged = persistent?.cy === cy && persistent.dataRef === elements && persistent.layoutKey === layoutKey;
    if (persistent?.cy === cy) persistent.unchanged = unchanged;
    if (unchanged) {
      perfPhase(perfRecord.current, "reuse", performance.now() - effectStart);
      markPainted();
      perfSettled(perfRecord.current, "cache");
      return;
    }
    // Grouped mode keeps its grid; only the full free graph uses rings.
    const layout = boxed ? computeGroupedLayout(elements, { aspect: cy.width() / Math.max(cy.height(), 1), titles }) : null;
    const rings = mode === "full" && !boxed ? computeRingLayout(elements) : null;
    if (mode === "full") {
      // A crowded ring can be much wider than a force layout. Let Fit show all of it,
      // including on phones, while retaining the grouped graph's zoom floor.
      const outerRadius = rings?.rings.at(-1)?.radius ?? 0;
      cy.minZoom(rings ? Math.min(0.1, Math.min(cy.width(), cy.height()) / Math.max(1, (outerRadius + 150) * 4)) : 0.1);
    }
    const afterModel = performance.now();
    perfPhase(perfRecord.current, "layoutModel", afterModel - effectStart);
    const changed = syncElements(cy, elements, layout, rings);
    const afterSync = performance.now();
    perfPhase(perfRecord.current, "syncElements", afterSync - afterModel);
    if (persistent?.cy === cy) {
      // Remember what `cy` mirrors, so a return with the same data needs no sync at all.
      persistent.dataRef = elements;
      persistent.layoutKey = layoutKey;
    }
    const first = firstRun.current;
    firstRun.current = false;
    // StrictMode mounts, destroys and remounts the instance: a fresh one needs its first fit.
    const freshInstance = cy.nodes().nonempty() && !laidOut.has(cy);
    if (cy.nodes().nonempty()) laidOut.add(cy);
    const boxedChanged = lastBoxed.current !== boxed;
    lastBoxed.current = boxed;
    if (!first && changed === 0 && !boxedChanged && !freshInstance && !rings) {
      markPainted();
      perfSettled(perfRecord.current, "cache");
      return;
    }
    // The element sync and the placement are the two heavy steps of a cold graph. Yield
    // between them so a cold boot never stacks them into one long task; leaving the page
    // cancels the frame and the next visit starts clean.
    const frame = requestAnimationFrame(() => {
      placeFrame.current = null;
      if (cyRef.current !== cy || cy.destroyed()) return;
      // The reader may have left between the sync above and this frame: placing the picture
      // and its first full render would land in the next page's budget.
      if (mode === "full" && currentNavigationEpoch() !== mountEpoch.current) return;
      const placeStart = performance.now();
      const scope = bridge.cache;
      // First look at this data: reuse the last visit's positions so a return is instant.
      // Keep positioned notes, spacers and band headers; guides stay anchored at the origin.
      const cached =
        first && scope
          ? recallGraph(
              scope,
              cy
                .nodes()
                .not("[ringGuide]")
                .map((node) => node.id()),
            )
          : null;
      if (cached) {
        cy.batch(() => {
          cy.nodes().forEach((node) => {
            const position = cached.positions.get(node.id());
            if (position) node.position(position);
          });
        });
        if (cached.exact) {
          // Same graph as last time: restore the picture as it was, no layout, no fit.
          perfCount("cacheHits");
          if (cached.camera) {
            cy.stop(true);
            cy.viewport(cached.camera);
            perfCount("cameraRestores");
          } else {
            fitVisible(false);
          }
          scaleLabelsToFit(cy, cy.zoom());
          toggleDetailLabels(cy);
          toggleLabelCulling(cy);
          rememberGraphState(cy, scope);
          perfPhase(perfRecord.current, "place", performance.now() - placeStart);
          markPainted();
          perfSettled(perfRecord.current, "cache");
          return;
        }
        // Structure changed: recompute the grid or rings for the current node set.
        perfCount("cachePartials");
        if (layout) {
          runPresetLayout(cy, layout);
          fitVisible(false);
          scaleLabelsToFit(cy, cy.zoom());
          toggleDetailLabels(cy);
          rememberGraphState(cy, scope);
          perfPhase(perfRecord.current, "place", performance.now() - placeStart);
          markPainted();
          perfSettled(perfRecord.current, "layout");
          return;
        }
      }
      if (mode === "local") {
        cy.nodes().removeStyle("font-size");
        runLayout(cy, { randomize: true, animate: false, compact: true, fit: () => fitVisible(false) });
        perfPhase(perfRecord.current, "place", performance.now() - placeStart);
        markPainted();
        perfSettled(perfRecord.current, "layout");
        return;
      }
      if (layout) {
        runPresetLayout(cy, layout);
        if (first || boxedChanged || freshInstance) fitVisible(false);
        else scaleLabelsToFit(cy, cy.zoom());
        toggleDetailLabels(cy);
        rememberGraphState(cy, scope);
        perfPhase(perfRecord.current, "place", performance.now() - placeStart);
        markPainted();
        perfSettled(perfRecord.current, "layout");
        return;
      }
      if (rings) {
        cy.nodes().removeStyle("font-size");
        perfCount("layouts");
        perfCount("presets");
        settleTo(cy, rings.positions, { animate: false });
        if (first || boxedChanged || freshInstance) fitVisible(false);
        toggleDetailLabels(cy);
        toggleLabelCulling(cy);
        rememberGraphState(cy, scope);
        perfPhase(perfRecord.current, "place", performance.now() - placeStart);
        markPainted();
        perfSettled(perfRecord.current, "layout");
      }
    });
    placeFrame.current = frame;
    return () => {
      if (placeFrame.current === frame) {
        cancelAnimationFrame(frame);
        placeFrame.current = null;
      }
    };
  }, [elements, mode, reduce, boxed, t, elementsReady]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-apply after the elements sync
  useEffect(() => {
    // Nothing to hide until the elements are in the kept canvas.
    if (!elementsReady) return;
    const cy = cyRef.current;
    if (!cy) return;
    const applied = persistent?.cy === cy ? persistent : null;
    // Same picture, same filter: the classes on the kept instance are already right.
    if (applied?.unchanged && applied.appliedVisibility?.ids === visibleIds && applied.appliedVisibility.boxed === boxed) return;
    const started = performance.now();
    const inView = (id: string) => visibleIds === null || visibleIds.has(id);
    cy.batch(() => {
      // Members first: a hidden layer box disappears together with its members.
      cy.nodes()
        .not(":parent, [bandLabel], [spacer], [ringGuide]")
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
      cy.nodes("[ringGuide]").forEach((guide) => {
        const members = guide.data("members") as string[];
        guide.toggleClass("gone", !members.some((id) => !cy.getElementById(id).hasClass("gone")));
      });
    });
    perfPhase(perfRecord.current, "visibility", performance.now() - started);
    if (applied) applied.appliedVisibility = { ids: visibleIds, boxed };
  }, [elements, visibleIds, boxed, elementsReady]);

  useEffect(() => {
    // The query is applied once the elements exist; before that there is nothing to dim.
    if (!elementsReady) return;
    const cy = cyRef.current;
    if (!cy) return;
    const applied = persistent?.cy === cy ? persistent : null;
    if (applied?.unchanged && applied.appliedQuery === query) return;
    const started = performance.now();
    const hits = new Set(matchNodes(elements.nodes, query).map((node) => node.id));
    const searching = query.trim().length > 0;
    cy.batch(() => {
      cy.elements().removeClass("dim hit");
      if (!searching) return;
      cy.nodes().forEach((node) => {
        node.addClass(hits.has(node.id()) ? "hit" : "dim");
      });
      // Boxes, band headers and guides are structure, not search results.
      cy.nodes(":parent, [bandLabel], [spacer], [ringGuide]").removeClass("dim hit");
      cy.edges().addClass("dim");
    });
    perfPhase(perfRecord.current, "search", performance.now() - started);
    if (applied) applied.appliedQuery = query;
  }, [elements, query, elementsReady, persistent]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-apply after the elements sync
  useEffect(() => {
    if (!elementsReady) return;
    const cy = cyRef.current;
    if (!cy) return;
    const applied = persistent?.cy === cy ? persistent : null;
    const picked = selectedId ?? (mode === "local" ? centerId : null);
    // The kept picture already carries this selection: nothing to redraw.
    if (applied?.unchanged && applied.appliedSelection === picked) return;
    const started = performance.now();
    cy.batch(() => {
      cy.nodes(".picked").removeClass("picked");
      if (picked) cy.getElementById(picked).addClass("picked");
    });
    applyHighlight(cy, picked ?? null, boxed);
    perfPhase(perfRecord.current, "selection", performance.now() - started);
    if (applied) applied.appliedSelection = picked;
  }, [elements, selectedId, mode, centerId, boxed, elementsReady]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        ref={containerRef}
        data-testid={mode === "full" ? "graph-canvas" : "local-graph-canvas"}
        role="img"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the canvas is one keyboard tab stop, focused by the search field's second Escape, and labelled with its node/link counts.
        tabIndex={0}
        aria-label={t("graph.canvas", { nodes: elements.nodes.length, edges: elements.edges.length })}
        className="h-full w-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />
      <GraphHoverTooltip bridge={bridge} palette={palette} />
    </div>
  );
}

/** Each full-graph mode keeps its renderer, styles, positions and camera across toggles. */
export default function GraphCanvas(props: GraphCanvasProps) {
  const key = props.mode === "full" ? (props.grouped === false ? "free" : "grouped") : "local";
  return <GraphCanvasInstance key={key} {...props} />;
}
