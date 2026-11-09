import type { GraphData, GraphNode, GraphNodeType, NoteType } from "@marcozvd/basics-core";
import { Crosshair, FilePlus2, Layers, Scan, Search, SquareArrowOutUpRight, Waypoints, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { lazy, type KeyboardEvent as ReactKeyboardEvent, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { type GraphCacheScope, type GraphLayoutMode, graphCacheKey } from "@/components/graph/graph-cache";
import type { GraphCanvasHandle, Insets } from "@/components/graph/graph-canvas";
import { GRAPH_TYPES, layerSlice, matchNodes, neighborhood } from "@/components/graph/graph-model";
import { GraphSkeleton } from "@/components/graph/graph-skeleton";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Button } from "@/components/motion/button/base";
import { Drawer } from "@/components/motion/drawer";
import { Input } from "@/components/motion/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import { Switch } from "@/components/motion/switch";
import { Tooltip } from "@/components/motion/tooltip";
import { TypeChip } from "@/components/note-form/note-preview";
import { DelayedMount, ErrorState } from "@/components/state";
import { Button as LinkButton } from "@/components/ui/button";
import { type TranslationKey, useT } from "@/i18n";
import { modChord } from "@/lib/desktop";
import { EASE_OUT, SPRING_PRESS } from "@/lib/ease";
import { useIntentNavigate } from "@/lib/intent-navigate";
import { DOCK_SPACE, DOCK_SPACE_VERTICAL, useResolvedDockEdge } from "@/lib/navigation";
import { useDocumentTitle } from "@/lib/page-title";
import { currentNavigationEpoch, PAGE_ENTER_MS, PAGE_REDUCED_MS } from "@/lib/page-transition";
import { useGraph, useHealth, useLayers, useNote, useNotes, useStats } from "@/lib/queries";
import { cn } from "@/lib/utils";

// Cytoscape is the single heaviest dependency in the panel: load its chunk only when the
// canvas is actually about to mount, after the page transition has finished.
const GraphCanvas = lazy(() => import("@/components/graph/graph-canvas"));

/** Drawer width plus its right gap, kept clear when centering a node beside it. */
const DRAWER_SPACE = 372;
const TOOLBAR_OFFSET = 12;
/** Below this canvas width the toolbar drops its labels so it stays one row. */
const COMPACT_BELOW = 1500;
/** Below this the type chips may wrap inside the toolbar (phones and the rail). */
const NARROW_BELOW = 1000;
const GROUP_KEY = "basics:graph-group";

/** Grouped by layer unless the reader turned the switch off once. */
function readGrouped(): boolean {
  try {
    return localStorage.getItem(GROUP_KEY) !== "0";
  } catch {
    return true;
  }
}

const typeColor = (type: GraphNodeType) => (type === "missing" ? "var(--destructive)" : `var(--type-${type})`);

export function GraphPage() {
  const t = useT();
  const navigate = useIntentNavigate();
  const reduce = useReducedMotion() ?? false;
  // The floating bar's edge decides where the toolbar, the fit area and the drawer sit.
  const dockEdge = useResolvedDockEdge();
  const canvasRef = useRef<GraphCanvasHandle>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [broken, setBroken] = useState(false);
  const [grouped, setGrouped] = useState(readGrouped);
  const [hiddenTypes, setHiddenTypes] = useState<Set<GraphNodeType>>(() => new Set());
  const [layer, setLayer] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [toolbarHeight, setToolbarHeight] = useState(48);
  const [rootWidth, setRootWidth] = useState(0);
  // The canvas waits out the page's enter transition: cytoscape's chunk and its first layout
  // are the heaviest work in the app, and the transition should own the first frames.
  const [canvasReady, setCanvasReady] = useState(false);
  // The navigation this page was entered with. Captured here, before the canvas chunk and the
  // graph data arrive, so a canvas that mounts after the reader left can tell it is too late.
  const [navigationEpoch] = useState(() => currentNavigationEpoch());

  const graph = useGraph(broken);
  const layers = useLayers();
  const health = useHealth();
  const stats = useStats();
  const vaultEmpty = stats.data?.total === 0;
  const data = graph.data;
  useDocumentTitle(t("page.graph.title"));

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) return;
    const observer = new ResizeObserver(() => setToolbarHeight(toolbar.offsetHeight));
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

  // Holding the canvas back lets the enter transition finish before cytoscape boots.
  useEffect(() => {
    const timer = window.setTimeout(() => setCanvasReady(true), (reduce ? PAGE_REDUCED_MS : PAGE_ENTER_MS) + 40);
    return () => window.clearTimeout(timer);
  }, [reduce]);

  // Labels are costly at 1280 with the expanded sidebar: measure the canvas
  // width and fall back to icon-only controls before the toolbar has to wrap.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => setRootWidth(root.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const toolbarTop = TOOLBAR_OFFSET + (dockEdge === "top" ? DOCK_SPACE : 0);

  // ⌘F / Ctrl+F jumps to the node search, like Explore.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // The toolbar's measured height is part of the fit area, so no node can land
  // under it. When the row count changes (resize, sidebar toggle) refit at once.
  const lastToolbar = useRef(0);
  useEffect(() => {
    if (lastToolbar.current === 0) {
      lastToolbar.current = toolbarHeight;
      return;
    }
    if (lastToolbar.current === toolbarHeight) return;
    lastToolbar.current = toolbarHeight;
    canvasRef.current?.fit();
  }, [toolbarHeight]);

  // Refit when the bar changes edge: the fit area moved even if the toolbar did not.
  const lastDockEdge = useRef(dockEdge);
  useEffect(() => {
    if (lastDockEdge.current === dockEdge) return;
    lastDockEdge.current = dockEdge;
    canvasRef.current?.fit();
  }, [dockEdge]);

  const insets: Insets = useMemo(
    () => ({
      top: toolbarTop + toolbarHeight + 20,
      right: 32 + (dockEdge === "right" ? DOCK_SPACE_VERTICAL : 0),
      bottom: 24 + (dockEdge === "bottom" ? DOCK_SPACE : 0),
      left: 32 + (dockEdge === "left" ? DOCK_SPACE_VERTICAL : 0),
    }),
    [toolbarTop, toolbarHeight, dockEdge],
  );

  const byId = useMemo(() => new Map((data?.nodes ?? []).map((node) => [node.id, node])), [data]);

  const counts = useMemo(() => {
    const map = new Map<GraphNodeType, number>();
    for (const node of data?.nodes ?? []) map.set(node.type, (map.get(node.type) ?? 0) + 1);
    return map;
  }, [data]);

  const visibleIds = useMemo(() => {
    if (!data) return null;
    const inLayer = layer !== "all" ? layerSlice(data, layer) : null;
    const inFocus = focusId ? neighborhood(data, focusId) : null;
    if (!hiddenTypes.size && !inLayer && !inFocus) return null;
    return new Set(
      data.nodes
        .filter(
          (node) =>
            node.id === focusId ||
            (!hiddenTypes.has(node.type) && (!inLayer || inLayer.has(node.id)) && (!inFocus || inFocus.has(node.id))),
        )
        .map((node) => node.id),
    );
  }, [data, layer, focusId, hiddenTypes]);

  const matches = useMemo(() => {
    const nodes = (data?.nodes ?? []).filter((node) => !visibleIds || visibleIds.has(node.id));
    return matchNodes(nodes, search);
  }, [data, visibleIds, search]);

  // Where this picture was left, so coming back (or reloading) paints it at once.
  // The camera only counts for an unfiltered view: a slice has its own framing.
  const cacheScope = useMemo<GraphCacheScope | null>(() => {
    const vault = health.data?.vault;
    if (!data || !vault) return null;
    const layout: GraphLayoutMode = grouped && !focusId ? "grouped" : "flat";
    const camera = !focusId && layer === "all" && hiddenTypes.size === 0;
    return { key: graphCacheKey(vault, layout, data), vault, layout, camera };
  }, [data, grouped, focusId, layer, hiddenTypes, health.data?.vault]);

  // Focus and layer slices change what is on screen, so bring it into view.
  const fitKey = `${focusId ?? ""}|${layer}`;
  const lastFitKey = useRef(fitKey);
  useEffect(() => {
    if (lastFitKey.current === fitKey) return;
    lastFitKey.current = fitKey;
    canvasRef.current?.fit();
  }, [fitKey]);

  // Toggling broken links swaps the data set; fit once the new variant is laid out.
  // Live refreshes (vault events) keep the camera where it is.
  const fitOnData = useRef(false);
  useEffect(() => {
    if (!data || !fitOnData.current || graph.isPlaceholderData) return;
    fitOnData.current = false;
    canvasRef.current?.fit();
  }, [data, graph.isPlaceholderData]);

  const toggleBroken = (next: boolean) => {
    fitOnData.current = true;
    setBroken(next);
  };

  const toggleGrouped = (next: boolean) => {
    setGrouped(next);
    try {
      localStorage.setItem(GROUP_KEY, next ? "1" : "0");
    } catch {
      // Private mode: the switch still works for this visit.
    }
  };

  // A live refresh can delete the selected or focused note.
  useEffect(() => {
    if (!data) return;
    if (selectedId && !byId.has(selectedId)) setSelectedId(null);
    if (focusId && !byId.has(focusId)) setFocusId(null);
  }, [data, byId, selectedId, focusId]);

  const selected = selectedId ? byId.get(selectedId) : undefined;
  // Keep the last node rendered while the drawer slides out.
  const lastSelected = useRef<GraphNode | undefined>(undefined);
  if (selected) lastSelected.current = selected;

  const toggleType = (type: GraphNodeType) =>
    setHiddenTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });

  const openNote = (id: string) => navigate(`/notes/${encodeURIComponent(id)}`);

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    // Esc clears the query first; a second Esc drops focus into the canvas, which is one tab
    // stop with its own role and label, so the toolbar is not the only way back to the graph.
    if (event.key === "Escape") {
      event.preventDefault();
      if (search) {
        setSearch("");
        return;
      }
      canvasRef.current?.focus();
      return;
    }
    if (event.key !== "Enter") return;
    const first = matches[0];
    if (!first) return;
    event.preventDefault();
    setSelectedId(first.id);
    canvasRef.current?.centerOn(first.id, { avoidRight: DRAWER_SPACE });
  };

  const focusNode = (id: string) => {
    setFocusId(id);
    setSearch("");
    setSelectedId(null);
  };

  const types = GRAPH_TYPES.filter((type) => type !== "missing" || broken);
  const focused = focusId ? byId.get(focusId) : undefined;
  const compact = rootWidth > 0 && rootWidth < COMPACT_BELOW;
  const narrow = rootWidth > 0 && rootWidth < NARROW_BELOW;

  return (
    <div ref={rootRef} className="relative min-h-0 flex-1">
      {graph.isPending || (health.isPending && !health.data) ? (
        <DelayedMount>
          <GraphSkeleton className="absolute inset-0" label={t("state.loading")} />
        </DelayedMount>
      ) : graph.error ? (
        <div className="mx-auto max-w-xl px-6 pt-24">
          <ErrorState error={graph.error} />
        </div>
      ) : data && data.nodes.length === 0 ? (
        <EmptyGraph vaultEmpty={vaultEmpty} />
      ) : data ? (
        canvasReady ? (
          <Suspense fallback={<GraphSkeleton className="absolute inset-0" label={t("state.loading")} />}>
            <GraphCanvas
              ref={canvasRef}
              data={data}
              mode="full"
              navigationEpoch={navigationEpoch}
              cacheScope={cacheScope}
              visibleIds={visibleIds}
              query={search}
              grouped={grouped && !focusId}
              selectedId={selectedId}
              insets={insets}
              onNodeClick={setSelectedId}
              onBackgroundClick={() => setSelectedId(null)}
              className="absolute inset-0"
            />
          </Suspense>
        ) : (
          <GraphSkeleton className="absolute inset-0" label={t("state.loading")} />
        )
      ) : null}

      {(data?.nodes.length ?? 0) > 0 ? (
        <div
          ref={toolbarRef}
          role="toolbar"
          aria-label={t("graph.toolbar")}
          data-testid="graph-toolbar"
          data-compact={compact || undefined}
          className={cn(
            "absolute left-3 z-10 flex max-w-[calc(100%-24px)] items-center gap-1 rounded-[22px] border border-border p-1.5",
            narrow ? "flex-wrap" : "flex-nowrap",
            "bg-card/85 shadow-[0_8px_30px_rgba(0,0,0,0.18)] backdrop-blur-xl dark:shadow-[0_8px_30px_rgba(0,0,0,0.35)]",
          )}
          style={{ top: toolbarTop }}
        >
          <div className="flex min-w-0 items-center gap-2 pr-1 pl-2">
            <h1 className="shrink-0 text-[13px] font-semibold tracking-tight" title={t("graph.intro")}>
              {t("page.graph.title")}
            </h1>
            <p className="sr-only">{t("graph.intro")}</p>
          </div>

          <ToolbarDivider />

          <fieldset
            aria-label={t("graph.types")}
            className={cn("m-0 flex min-w-0 items-center gap-0.5 border-0 p-0", narrow ? "flex-wrap" : "flex-nowrap")}
          >
            {types.map((type) => {
              const shown = !hiddenTypes.has(type);
              return (
                <Tooltip key={type} content={t(`type.${type}.hint` as TranslationKey)} side="bottom">
                  <motion.button
                    type="button"
                    aria-pressed={shown}
                    data-testid={`graph-type-${type}`}
                    onClick={() => toggleType(type)}
                    whileTap={reduce ? undefined : { scale: 0.97 }}
                    transition={SPRING_PRESS}
                    className={cn(
                      "inline-flex h-8 items-center rounded-full text-[12px] font-medium transition-colors",
                      compact ? "gap-1 px-1.5" : "gap-1.5 px-2.5",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      shown ? "text-foreground hover:bg-muted/70" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-2 shrink-0 rounded-full transition-opacity",
                        type === "missing" && "border border-dashed border-destructive bg-transparent!",
                        !shown && "opacity-30",
                      )}
                      style={{ backgroundColor: typeColor(type) }}
                    />
                    <span className={cn(!shown && "line-through decoration-muted-foreground/50")}>
                      {t(`type.${type}` as TranslationKey)}
                    </span>
                    <span className={cn("font-mono text-[11px]", compact && "sr-only")}>{counts.get(type) ?? 0}</span>
                  </motion.button>
                </Tooltip>
              );
            })}
          </fieldset>

          <ToolbarDivider />

          <div data-testid="graph-layer">
            <Select value={layer} onValueChange={setLayer} className={compact ? "w-32" : "w-40"}>
              <SelectTrigger className="h-8 rounded-full border-border bg-muted/60 px-3 py-0 text-[12px]">
                <span className="flex min-w-0 items-center gap-2">
                  <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <SelectValue className="truncate" />
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("graph.allLayers")}</SelectItem>
                {(layers.data ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title || item.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Input
            ref={searchRef}
            type="search"
            value={search}
            onChange={setSearch}
            onKeyDown={onSearchKeyDown}
            placeholder={t("graph.searchPlaceholder")}
            aria-label={t("graph.searchPlaceholder")}
            title={t("graph.searchHint")}
            aria-keyshortcuts="Meta+F Control+F"
            data-testid="graph-search"
            leftIcon={<Search />}
            rightIcon={
              search ? (
                <span
                  title={t("graph.matches", { count: matches.length })}
                  className={cn("mr-2.5 font-mono text-[11px]", matches.length ? "text-muted-foreground" : "text-destructive-text")}
                >
                  {matches.length}
                </span>
              ) : compact ? null : (
                // At the compact width the field is too narrow for both the placeholder and the
                // chord; the shortcut stays on the input's title and aria-keyshortcuts.
                <kbd className="mr-2.5 rounded-full border border-border px-1.5 font-mono text-[11px] leading-4 text-muted-foreground">
                  {modChord("F")}
                </kbd>
              )
            }
            className={compact ? "w-36" : "w-48"}
            classNames={{
              field: "h-8 rounded-full bg-muted/60",
              input: "text-[12px] [&::-webkit-search-cancel-button]:hidden",
              leftIcon: "left-2.5",
            }}
          />

          <ToolbarDivider />

          {/* The switch wears its label in the toolbar itself, not only in `aria-label`:
              the visible name is the control's text, so pointer and sighted keyboard users
              read what it does without hovering for a tooltip at compact widths. */}
          <Tooltip content={t("graph.groupByLayer")} side="bottom" disabled={!compact}>
            <span data-testid="graph-group" className="inline-flex h-8 items-center pr-1 pl-1.5">
              <Switch
                checked={grouped}
                onCheckedChange={toggleGrouped}
                ariaLabel={t("graph.groupByLayer")}
                label={t("graph.groupByLayer")}
                className="gap-1.5 [&>label]:text-[12px] [&>label]:font-medium [&>label]:whitespace-nowrap"
              />
            </span>
          </Tooltip>

          <Tooltip content={t("graph.showBroken")} side="bottom" disabled={!compact}>
            <span data-testid="graph-broken" className="inline-flex h-8 items-center pr-1 pl-1.5">
              <Switch
                checked={broken}
                onCheckedChange={toggleBroken}
                ariaLabel={t("graph.showBroken")}
                label={t("graph.showBroken")}
                className="gap-1.5 [&>label]:text-[12px] [&>label]:font-medium [&>label]:whitespace-nowrap"
              />
            </span>
          </Tooltip>

          <Tooltip content={t("graph.fit")} side="bottom">
            <motion.button
              type="button"
              aria-label={t("graph.fit")}
              data-testid="graph-fit"
              onClick={() => canvasRef.current?.fit()}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              transition={SPRING_PRESS}
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <Scan className="size-4" aria-hidden="true" />
            </motion.button>
          </Tooltip>

          {focusId && (
            <motion.span
              initial={{ opacity: 0, x: reduce ? 0 : -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-primary/12 pr-1 pl-3 text-[12px] font-medium text-primary-text"
            >
              <Crosshair className="size-3.5" aria-hidden="true" />
              <span className="max-w-40 truncate">
                {t("graph.focusing")}: {focused?.title ?? focusId}
              </span>
              <button
                type="button"
                data-testid="graph-show-all"
                onClick={() => setFocusId(null)}
                className="ml-1 inline-flex h-6 items-center gap-1 rounded-full bg-primary px-2.5 text-[11.5px] text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
              >
                {t("graph.showAll")}
              </button>
            </motion.span>
          )}
        </div>
      ) : null}

      <Drawer
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        ariaLabel={t("graph.drawer")}
        backdropClassName="bg-transparent backdrop-blur-none"
        className={cn(
          "right-3 bottom-[86px] w-[360px] rounded-2xl border border-border",
          dockEdge === "top" ? "top-[142px]" : "top-[60px]",
          dockEdge === "right" && "right-[94px]",
          "bg-popover/90 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl",
        )}
      >
        {lastSelected.current && (
          <NodeDetails node={lastSelected.current} data={data} onClose={() => setSelectedId(null)} onOpen={openNote} onFocus={focusNode} />
        )}
      </Drawer>
    </div>
  );
}

function ToolbarDivider() {
  // Dividers only make sense on one row; a wrapped phone toolbar drops them.
  return <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-border sm:block" />;
}

function EmptyGraph({ vaultEmpty }: { vaultEmpty: boolean }) {
  const t = useT();
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="flex max-w-md flex-col items-center gap-2 text-center">
        <Waypoints className="mb-1 size-5 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">{t(vaultEmpty ? "graph.emptyVault.title" : "graph.empty")}</p>
        <p className="text-sm text-muted-foreground">{t(vaultEmpty ? "graph.emptyVault.description" : "graph.emptyDescription")}</p>
        <LinkButton asChild size="sm" className="mt-2">
          <Link to={vaultEmpty ? "/?packs=1" : "/explore"}>{t(vaultEmpty ? "graph.emptyVault.action" : "graph.emptyAction")}</Link>
        </LinkButton>
      </div>
    </div>
  );
}

interface NodeDetailsProps {
  node: GraphNode;
  data: GraphData | undefined;
  onClose: () => void;
  onOpen: (id: string) => void;
  onFocus: (id: string) => void;
}

function NodeDetails({ node, data, onClose, onOpen, onFocus }: NodeDetailsProps) {
  const t = useT();
  const missing = node.type === "missing";
  const detail = useNote(missing ? undefined : node.id);
  const summaries = useNotes();
  const summary = summaries.data?.find((item) => item.id === node.id);
  const linkedFrom = useMemo(() => (data?.edges ?? []).filter((edge) => edge.target === node.id).length, [data, node.id]);
  const links = detail.data?.links.length ?? 0;
  const backlinks = detail.data?.backlinks.length ?? (missing ? linkedFrom : 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-4">
        {missing ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/12 px-2 py-0.5 text-[11px] font-medium text-destructive-text">
            <span aria-hidden="true" className="size-1.5 rounded-full border border-dashed border-destructive" />
            {t("type.missing")}
          </span>
        ) : (
          <TypeChip type={node.type as NoteType} />
        )}
        <button
          type="button"
          aria-label={t("graph.close")}
          onClick={onClose}
          className="-mr-1 grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-4">
        <h2 className="text-lg leading-tight font-semibold tracking-tight break-words">{node.title}</h2>
        <p className="mt-1 font-mono text-[11px] break-all text-muted-foreground">{detail.data?.path ?? node.id}</p>

        <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
          {missing ? t("graph.missingDescription") : (summary?.excerpt ?? "")}
        </p>

        {node.layers.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {node.layers.map((id) => (
              <span
                key={id}
                className="inline-flex h-5 items-center rounded-full border border-border px-2 font-mono text-[11px] text-muted-foreground"
              >
                {id}
              </span>
            ))}
          </div>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-2">
          {!missing && <Stat label={t("graph.links")} value={links} />}
          <Stat label={t("graph.backlinks")} value={backlinks} />
        </dl>
      </div>

      <div className="flex items-center gap-2 border-t border-border px-4 py-3">
        {missing ? (
          <Button
            size="sm"
            pressScale={0.97}
            data-testid="graph-create-note"
            onClick={() => window.dispatchEvent(new CustomEvent("basics:new-note", { detail: { id: node.id } }))}
          >
            <FilePlus2 className="size-3.5" aria-hidden="true" />
            {t("graph.createNote")}
          </Button>
        ) : (
          <Button size="sm" pressScale={0.97} data-testid="graph-open-note" onClick={() => onOpen(node.id)}>
            <SquareArrowOutUpRight className="size-3.5" aria-hidden="true" />
            {t("graph.openNote")}
          </Button>
        )}
        <Button size="sm" variant="secondary" pressScale={0.97} data-testid="graph-focus" onClick={() => onFocus(node.id)}>
          <Crosshair className="size-3.5" aria-hidden="true" />
          {t("graph.focus")}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/50 px-3 py-2">
      <dt className="text-[11px] font-medium text-muted-foreground">{label}</dt>
      <dd className="font-mono text-lg font-semibold tabular-nums">
        <AnimatedNumber value={value} startOnView={false} duration={0.5} />
      </dd>
    </div>
  );
}
