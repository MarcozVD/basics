import type { GraphData, GraphNodeType } from "@marcozvd/basics-core";
import cytoscape, { type Core, type ElementDefinition, type NodeSingular, type Position, type StylesheetJson } from "cytoscape";
import fcose from "cytoscape-fcose";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type Ref, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { type TranslationKey, useT } from "@/i18n";
import { EASE_OUT } from "@/lib/ease";
import { cn } from "@/lib/utils";
import { GRAPH_TYPES, localGraph, matchNodes } from "./graph-model";

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
  background: string;
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
const MAX_FIT_ZOOM = 1.6;
const LAYOUT_MS = 400;
const CAMERA_MS = 280;
/** Above this many nodes panning draws a cached texture and skips edges. */
const LARGE_GRAPH = 300;
const NO_INSETS: Insets = { top: 16, right: 16, bottom: 16, left: 16 };

const nodeSize = (degree: number) => 18 + 4 * Math.sqrt(degree);
const edgeId = (source: string, target: string) => `edge:${source}|${target}`;

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const read = (name: string) => css.getPropertyValue(name).trim();
  const types = Object.fromEntries(
    GRAPH_TYPES.map((type) => [type, read(type === "missing" ? "--destructive" : `--type-${type}`)]),
  ) as Record<GraphNodeType, string>;
  return {
    types,
    foreground: read("--foreground"),
    muted: read("--muted-foreground"),
    background: read("--background"),
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
        label: "data(title)",
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
    { selector: ".fade", style: { opacity: 0.15 } },
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

function toElements(data: GraphData): ElementDefinition[] {
  return [
    ...data.nodes.map((node) => ({
      group: "nodes" as const,
      data: { id: node.id, type: node.type, title: node.title, degree: node.degree, size: nodeSize(node.degree) },
    })),
    ...data.edges.map((edge) => ({
      group: "edges" as const,
      data: { id: edgeId(edge.source, edge.target), source: edge.source, target: edge.target, kind: edge.kind },
    })),
  ];
}

/** Final positions of nodes still gliding into place after a layout. */
const gliding = new WeakMap<Core, Map<string, Position>>();

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
}

/**
 * Runs fcose synchronously, optionally fits the camera to the final positions, then
 * glides nodes from where they were (or from the middle, on the first run).
 */
function runLayout(cy: Core, opts: { randomize: boolean; animate: boolean; compact?: boolean; fit?: () => void }) {
  const nodes = cy.nodes();
  if (nodes.empty()) return;
  const before = new Map<string, Position>(nodes.map((node) => [node.id(), { ...node.position() }]));
  cy.layout({
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
  } as cytoscape.LayoutOptions).run();
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

/** Mirrors `data` into the graph in place; returns how many nodes were added or removed. */
function syncElements(cy: Core, data: GraphData): number {
  const wanted = toElements(data);
  const ids = new Set(wanted.map((element) => element.data.id as string));
  let changed = 0;
  cy.batch(() => {
    cy.elements().forEach((element) => {
      if (ids.has(element.id())) return;
      if (element.isNode()) changed += 1;
      element.remove();
    });
    const added: cytoscape.NodeSingular[] = [];
    for (const element of wanted) {
      const existing = cy.getElementById(element.data.id as string);
      if (existing.nonempty()) {
        existing.data(element.data);
        continue;
      }
      if (element.group === "nodes") {
        added.push(cy.add(element) as unknown as NodeSingular);
        changed += 1;
      }
    }
    for (const element of wanted) {
      if (element.group === "edges" && cy.getElementById(element.data.id as string).empty()) cy.add(element);
    }
    // New nodes start next to the neighbours they already have, so the refresh barely moves.
    for (const node of added) {
      const placed = node.neighborhood("node").filter((other) => !added.includes(other as NodeSingular));
      const anchor = placed.nonempty() ? placed.boundingBox({}) : cy.extent();
      node.position({
        x: anchor.x1 + anchor.w / 2 + (Math.random() - 0.5) * 60,
        y: anchor.y1 + anchor.h / 2 + (Math.random() - 0.5) * 60,
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

  // Callbacks and options change every render; handlers read the latest through refs.
  const latest = useRef({ onNodeClick, onBackgroundClick, insets, reduce, mode });
  latest.current = { onNodeClick, onBackgroundClick, insets, reduce, mode };

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
      cy.batch(() => {
        cy.elements().addClass("fade");
        node.closedNeighborhood().removeClass("fade").addClass("lit");
      });
      container.style.cursor = "pointer";
      setHover(hoverFrom(node));
    });
    cy.on("mouseout", "node", () => {
      cy.batch(() => cy.elements().removeClass("fade lit"));
      container.style.cursor = "";
      setHover(null);
    });
    cy.on("viewport", () => {
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
      if ((event.target as cytoscape.SingularElementArgument).isNode?.()) latest.current.onNodeClick?.((event.target as NodeSingular).id());
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
    const changed = syncElements(cy, elements);
    const first = firstRun.current;
    firstRun.current = false;
    if (!first && changed === 0) return;
    const animate = !reduce;
    if (mode === "local") {
      runLayout(cy, { randomize: true, animate: false, compact: true, fit: () => fitVisible(false) });
      return;
    }
    runLayout(cy, { randomize: first, animate, fit: first ? () => fitVisible(false) : undefined });
  }, [elements, mode, reduce]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-apply after the elements sync
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.nodes().forEach((node) => {
        node.toggleClass("gone", visibleIds !== null && !visibleIds.has(node.id()));
      });
    });
  }, [elements, visibleIds]);

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
  }, [elements, selectedId, mode, centerId]);

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
