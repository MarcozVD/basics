import type { NoteType } from "@marcozvd/basics-core";
import { ArrowDownUp, Layers, LayoutGrid, LayoutList, Package, Plus, Search, SearchX } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Button } from "@/components/motion/button/base";
import { CARD_TARGET_CLASS, Card, CardContent, CardFooter, CardHeader } from "@/components/motion/card";
import { Input } from "@/components/motion/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { TypeChip } from "@/components/note-form/note-preview";
import { Page, Reveal } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Loading } from "@/components/state";
import { Button as LinkButton } from "@/components/ui/button";
import { type TranslationKey, useT } from "@/i18n";
import { modChord } from "@/lib/desktop";
import { EASE_OUT, SPRING_LAYOUT, SPRING_PRESS } from "@/lib/ease";
import { useIntentNavigate } from "@/lib/intent-navigate";
import { useIntro } from "@/lib/intro";
import { useFirstPaint, useProgressiveCount } from "@/lib/progressive";
import { useLayers, useNotes, useSearch, useStats } from "@/lib/queries";
import { formatCompactRelativeTime } from "@/lib/relative-time";
import { useRouteSearchParams } from "@/lib/route-query";
import { cn } from "@/lib/utils";

const TYPE_ORDER: NoteType[] = ["tech", "practice", "check", "profile", "project", "layer"];
const SORTS = ["title", "updated", "type"] as const;
const VIEWS = ["list", "grid"] as const;
type Sort = (typeof SORTS)[number];
type View = (typeof VIEWS)[number];
const DEFAULT_SORT: Sort = "type";
const DEFAULT_VIEW: View = "list";

/** Only the first items of a list stagger in; the rest appear with them. */
const STAGGER_LIMIT = 10;
const STAGGER_STEP = 0.02;
const MAX_TAGS = 3;
/** Layer chips shown per row before a `+n`; a chip only truncates when a name is very long. */
const MAX_LAYERS = 2;
/**
 * Dense list columns. Title, layers, tags and updated are the defaults; the source
 * column only joins them when the vault actually holds more than one provenance.
 */
const LIST_GRID = "grid items-center gap-2 min-[1280px]:gap-3 grid-cols-[16px_minmax(0,1fr)_auto]";
const LIST_GRID_COLUMNS =
  "min-[1280px]:grid-cols-[16px_minmax(240px,1fr)_minmax(0,110px)_minmax(130px,1fr)_88px] min-[1440px]:grid-cols-[16px_minmax(240px,1.4fr)_minmax(0,120px)_minmax(150px,1fr)_90px]";
const LIST_GRID_COLUMNS_SOURCE =
  "min-[1280px]:grid-cols-[16px_minmax(240px,1fr)_minmax(0,110px)_minmax(130px,1fr)_78px_88px] min-[1440px]:grid-cols-[16px_minmax(240px,1.4fr)_minmax(0,120px)_minmax(150px,1fr)_86px_90px]";

const listGrid = (showSource: boolean) => cn(LIST_GRID, showSource ? LIST_GRID_COLUMNS_SOURCE : LIST_GRID_COLUMNS);

interface Row {
  id: string;
  type: NoteType;
  title: string;
  source: string;
  kind?: string;
  layers: string[];
  tags: string[];
  excerpt?: string;
  updated?: string;
}

interface Group {
  type: NoteType | null;
  start: number;
  rows: Row[];
}

const typeColor = (type: NoteType) => `var(--type-${type})`;

/** Provenance categories: comparing two agent ids is not a reason to show a Source column. */
function sourceKind(source: string): "agent" | "pack" | "manual" {
  if (source.startsWith("agent:")) return "agent";
  if (source.startsWith("pack:")) return "pack";
  return "manual";
}

function pick<T extends string>(value: string | null, options: readonly T[], fallback: T): T {
  return value && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

const STORAGE_KEY = "basics:explore";

interface ExplorePrefs {
  view: View;
  sort: Sort;
  type?: NoteType;
  layer?: string;
}

/** Saved Explore controls; malformed or missing data falls back to the defaults. */
function readPrefs(): ExplorePrefs | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<ExplorePrefs> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const layer = parsed.layer;
    return {
      view: pick(parsed.view ?? null, VIEWS, DEFAULT_VIEW),
      sort: pick(parsed.sort ?? null, SORTS, DEFAULT_SORT),
      type: parsed.type && TYPE_ORDER.includes(parsed.type) ? parsed.type : undefined,
      layer: typeof layer === "string" && layer ? layer : undefined,
    };
  } catch {
    return null;
  }
}

function writePrefs(prefs: ExplorePrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
}

/** Only non-default values go in the URL, matching how the controls build it. */
function prefsToParams(prefs: ExplorePrefs): URLSearchParams {
  const next = new URLSearchParams();
  if (prefs.type) next.set("type", prefs.type);
  if (prefs.layer) next.set("layer", prefs.layer);
  if (prefs.sort !== DEFAULT_SORT) next.set("sort", prefs.sort);
  if (prefs.view !== DEFAULT_VIEW) next.set("view", prefs.view);
  return next;
}

function sortRows(rows: Row[], sort: Sort): Row[] {
  const byTitle = (a: Row, b: Row) => a.title.localeCompare(b.title);
  const sorted = [...rows];
  if (sort === "title") return sorted.sort(byTitle);
  if (sort === "updated") return sorted.sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? "") || byTitle(a, b));
  return sorted.sort((a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) || byTitle(a, b));
}

export function ExplorePage() {
  const t = useT();
  const navigate = useIntentNavigate();
  const { pathname } = useLocation();
  const reduce = useReducedMotion() ?? false;
  const searchRef = useRef<HTMLInputElement>(null);

  const [searchParams, setSearchParams] = useRouteSearchParams();
  const typeParam = searchParams.get("type");
  const type = typeParam && TYPE_ORDER.includes(typeParam as NoteType) ? (typeParam as NoteType) : undefined;
  const layer = searchParams.get("layer") ?? undefined;
  const sort = pick(searchParams.get("sort"), SORTS, DEFAULT_SORT);
  const view = pick(searchParams.get("view"), VIEWS, DEFAULT_VIEW);
  const [searchText, setSearchText] = useState("");
  const [query, setQuery] = useState("");
  // Keyboard selection scrolls; pointer hover only moves the highlight.
  const [selected, setSelected] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const previousPath = useRef<string | null>(null);
  const persisted = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(searchText.trim());
      setSelected(0);
      setHovered(null);
    }, 200);
    return () => clearTimeout(timer);
  }, [searchText]);

  // ⌘F / Ctrl+F jumps to the search field instead of the browser's find bar.
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

  const filter = { type, layer };
  const layers = useLayers();
  const notes = useNotes(filter);
  const allNotes = useNotes();
  const allInLayer = useNotes(layer ? { layer } : {});
  const hits = useSearch(query, filter);
  const stats = useStats();
  // An empty vault and a filter that matches nothing need different words and
  // different ways out: filter first, then check whether there is anything at all.
  const vaultEmpty = stats.data?.total === 0;
  // The vault, not the filtered rows: a filter that matches nothing still sits on a page
  // with data, so the intro belongs behind the `?` there.
  const intro = useIntro("explore", stats.isSuccess ? (stats.data?.total ?? 0) > 0 : true);
  const listQuery = query ? hits : notes;

  const counts = useMemo(() => {
    const map = new Map<NoteType, number>();
    for (const note of allInLayer.data ?? []) map.set(note.type, (map.get(note.type) ?? 0) + 1);
    return map;
  }, [allInLayer.data]);

  const rows: Row[] = useMemo(() => {
    const toRow = (note: NonNullable<typeof notes.data>[number]): Row => ({
      id: note.id,
      type: note.type,
      title: note.title || note.id,
      source: note.source,
      kind: note.kind,
      layers: note.layers,
      tags: note.tags ?? [],
      excerpt: note.excerpt,
      updated: note.updated,
    });
    if (!query) return sortRows((notes.data ?? []).map(toRow), sort);
    // Search keeps its relevance order; summaries fill in what hits do not carry.
    const summaries = new Map((notes.data ?? []).map((note) => [note.id, note]));
    return (hits.data ?? []).map((hit) => {
      const summary = summaries.get(hit.id);
      return summary ? toRow(summary) : { id: hit.id, type: hit.type, title: hit.title || hit.id, source: "", layers: [], tags: [] };
    });
  }, [query, notes.data, hits.data, sort]);

  // Only a mix of provenances makes the Source column worth a column; a vault written
  // by one agent (or only by hand) does not repeat the same badge on every row. Read
  // the whole vault, not the current filter: narrowing to one source must not hide a
  // column the vault has earned.
  const showSource = useMemo(() => {
    const kinds = new Set(
      (allNotes.data ?? [])
        .map((note) => note.source)
        .filter(Boolean)
        .map(sourceKind),
    );
    return kinds.size > 1;
  }, [allNotes.data]);

  const grouped = !query && !type && sort === "type";
  const groups: Group[] = useMemo(() => {
    if (!grouped) return [{ type: null, start: 0, rows }];
    const result: Group[] = [];
    let start = 0;
    for (const item of TYPE_ORDER) {
      const members = rows.filter((row) => row.type === item);
      if (!members.length) continue;
      result.push({ type: item, start, rows: members });
      start += members.length;
    }
    return result;
  }, [grouped, rows]);

  // Long lists mount the first screenful, then fill in idle slices instead of one big commit.
  // The frame paints once before any row mounts, so the click's first frame is never the list.
  const firstPaint = useFirstPaint();
  const renderLimit = useProgressiveCount(rows.length, `${view}|${sort}|${type ?? ""}|${layer ?? ""}|${query}`, {
    active: firstPaint,
  });

  // Entering /explore without query params restores the saved controls; explicit params always win.
  useEffect(() => {
    const entering = previousPath.current !== "/explore" && pathname === "/explore";
    previousPath.current = pathname;
    if (!entering) return;
    if (searchParams.toString()) {
      writePrefs({ view, sort, type, layer });
      return;
    }
    const saved = readPrefs();
    if (!saved) return;
    const next = prefsToParams(saved);
    if (next.toString()) setSearchParams(next, { replace: true });
  }, [pathname, searchParams, setSearchParams, view, sort, type, layer]);

  useEffect(() => {
    if (pathname !== "/explore") return;
    if (!persisted.current) {
      persisted.current = true;
      return;
    }
    writePrefs({ view, sort, type, layer });
  }, [pathname, view, sort, type, layer]);

  const highlighted = Math.min(hovered ?? selected, Math.max(0, rows.length - 1));
  // Keyboard navigation can reach past the mounted slice; keep the row it points at mounted.
  const visibleRows = Math.max(renderLimit, highlighted + 1);

  useEffect(() => {
    if (selected >= rows.length) setSelected(Math.max(0, rows.length - 1));
  }, [rows.length, selected]);

  // Keep the keyboard-selected row on screen when the selection changes, but never on mount:
  // coming back from a note, the layout has already restored the scroll offset and this would
  // jump the list to the top. Comparing against the last value (instead of a "first run" flag)
  // survives StrictMode's double effect invocation.
  const visibleSelection = useRef(selected);
  useEffect(() => {
    if (visibleSelection.current === selected) return;
    visibleSelection.current = selected;
    document.getElementById(`note-row-${selected}`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  const layerTitles = useMemo(() => new Map((layers.data ?? []).map((item) => [item.id, item.title || item.id])), [layers.data]);

  const openNote = (id: string) => navigate(`/notes/${encodeURIComponent(id)}`);

  const updateParams = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: true });
    setSelected(0);
    setHovered(null);
  };

  const setSort = (value: Sort) => updateParams({ sort: value === DEFAULT_SORT ? null : value });

  const hasFilters = Boolean(type || layer || query || searchText);
  const clearFilters = () => {
    setSearchText("");
    setQuery("");
    updateParams({ type: null, layer: null });
  };

  const handleKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape" && event.target === searchRef.current && searchText) {
      event.preventDefault();
      setSearchText("");
      return;
    }
    if (!rows.length) return;
    const moveTo = (index: number) => {
      setHovered(null);
      setSelected(Math.max(0, Math.min(index, rows.length - 1)));
    };
    const next = event.key === "ArrowDown" || (view === "grid" && event.key === "ArrowRight");
    const previous = event.key === "ArrowUp" || (view === "grid" && event.key === "ArrowLeft");
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      moveTo(event.key === "Home" ? 0 : rows.length - 1);
    } else if (next) {
      event.preventDefault();
      moveTo(highlighted + 1);
    } else if (previous) {
      event.preventDefault();
      moveTo(highlighted - 1);
    } else if (event.key === "Enter") {
      const row = rows[highlighted];
      if (!row) return;
      event.preventDefault();
      openNote(row.id);
    }
  };

  const typeLabel = (value: NoteType) => t(`type.${value}` as TranslationKey);

  const itemMotion = (index: number) => ({
    layout: reduce ? false : ("position" as const),
    initial: index < STAGGER_LIMIT ? { opacity: 0, y: reduce ? 0 : 6 } : false,
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, transition: { duration: 0.1, ease: EASE_OUT } },
    transition: {
      duration: 0.18,
      ease: EASE_OUT,
      delay: Math.min(index, STAGGER_LIMIT) * STAGGER_STEP,
      layout: SPRING_LAYOUT,
    },
  });

  const renderItem = (row: Row, index: number) => {
    const props = {
      row,
      index,
      selected: index === highlighted,
      reduce,
      layerTitles,
      showSource,
      onHover: () => setHovered(index),
      onOpen: () => openNote(row.id),
    };
    return (
      <motion.div key={row.id} {...itemMotion(index)} className={view === "grid" ? "min-w-0" : undefined}>
        {view === "grid" ? <GridCard {...props} /> : <ListRow {...props} />}
      </motion.div>
    );
  };

  return (
    <Page className="pt-0">
      <Reveal index={0} className="mx-page-gutter sticky top-[var(--nav-top,0px)] z-20 bg-card px-page-gutter pt-4 pb-0">
        <PageHeader
          title={t("page.explore.title")}
          meta={
            <span className="font-mono text-sm text-muted-foreground">
              <AnimatedNumber value={rows.length} startOnView={false} duration={0.6} />
            </span>
          }
          description={intro.showIntro ? t("explore.intro") : undefined}
          hint={intro.showIntro ? undefined : t("explore.intro")}
          onDismissDescription={intro.showIntro ? intro.dismiss : undefined}
        >
          {/* One toolbar at 1280px: search, type, layer, sort, view and the single action. */}
          <fieldset
            aria-label={t("explore.filters")}
            className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0 min-[1280px]:flex-nowrap"
          >
            <Input
              ref={searchRef}
              type="search"
              value={searchText}
              onChange={setSearchText}
              onKeyDown={handleKeyDown}
              placeholder={t("explore.searchPlaceholder")}
              aria-label={t("explore.searchPlaceholder")}
              aria-keyshortcuts="Meta+F Control+F"
              leftIcon={<Search />}
              rightIcon={
                <kbd
                  title={t("explore.searchShortcut", { key: modChord("F") })}
                  className="mr-2.5 hidden rounded-full border border-border px-1.5 font-mono text-[10px] leading-4 text-muted-foreground @min-[13rem]:inline"
                >
                  {modChord("F")}
                </kbd>
              }
              className="w-full min-w-0 sm:w-60"
              classNames={{
                field: "h-8 bg-muted/60 @container",
                input: "pr-[3.75rem] text-[13px] @max-[13rem]:pr-3.5 [&::-webkit-search-cancel-button]:hidden",
                leftIcon: "left-2.5",
              }}
            />

            <Select
              value={type ?? "all"}
              onValueChange={(value) => updateParams({ type: value === "all" ? null : value })}
              className="w-[calc(50%-0.25rem)] min-w-0 sm:w-36 sm:flex-none"
            >
              <SelectTrigger
                aria-label={t("explore.typeFilter")}
                title={type ? t(`type.${type}.hint` as TranslationKey) : undefined}
                className="h-8 rounded-full border-border bg-muted/60 px-3 py-0 text-[13px]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                    style={{ backgroundColor: type ? typeColor(type) : "var(--muted-foreground)" }}
                  />
                  <span className="truncate">{type ? typeLabel(type) : t("explore.allTypes")}</span>
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{`${t("explore.allTypes")} (${allInLayer.data?.length ?? 0})`}</SelectItem>
                {TYPE_ORDER.map((item) => (
                  <SelectItem key={item} value={item}>{`${typeLabel(item)} (${counts.get(item) ?? 0})`}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(layers.data?.length ?? 0) > 0 || layer ? (
              <Select
                value={layer ?? "all"}
                onValueChange={(value) => updateParams({ layer: value === "all" ? null : value })}
                className="w-[calc(50%-0.25rem)] min-w-0 sm:w-44 sm:flex-none"
              >
                <SelectTrigger className="h-8 rounded-full border-border bg-muted/60 px-3 py-0 text-[13px]">
                  <span className="flex min-w-0 items-center gap-2">
                    <Layers className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <SelectValue className="truncate" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("explore.allLayers")}</SelectItem>
                  {(layers.data ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title || item.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            <Select
              value={sort}
              onValueChange={(value) => updateParams({ sort: value === DEFAULT_SORT ? null : value })}
              className="w-[calc(50%-0.25rem)] min-w-0 sm:w-48 sm:flex-none"
            >
              <SelectTrigger className="h-8 rounded-full border-border bg-muted/60 px-3 py-0 text-[13px]">
                <span className="flex min-w-0 items-center gap-2">
                  <ArrowDownUp className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">{t("explore.sort")}: </span>
                  <SelectValue className="truncate" />
                </span>
              </SelectTrigger>
              <SelectContent>
                {SORTS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {t(`explore.sort.${item}` as TranslationKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Tabs value={view} onValueChange={(value) => updateParams({ view: value === DEFAULT_VIEW ? null : value })} variant="segment">
              <TabsList aria-label={t("explore.view")}>
                <TabsTrigger
                  value="list"
                  icon={<LayoutList className="size-3.5" aria-hidden="true" />}
                  className="gap-1.5 px-2.5 py-1 text-[12px]"
                >
                  {t("explore.view.list")}
                </TabsTrigger>
                <TabsTrigger
                  value="grid"
                  icon={<LayoutGrid className="size-3.5" aria-hidden="true" />}
                  className="gap-1.5 px-2.5 py-1 text-[12px]"
                >
                  {t("explore.view.grid")}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent("basics:new-note", { detail: { type } }))}
              pressScale={0.97}
              className="shrink-0 whitespace-nowrap min-[1280px]:ml-auto"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              {t("explore.newNote")}
            </Button>
          </fieldset>

          {view === "list" && rows.length > 0 ? <ListHeader sort={sort} onSort={setSort} showSource={showSource} /> : null}
        </PageHeader>
      </Reveal>

      <div className="pt-1">
        {!firstPaint ? null : listQuery.isPending ? (
          <Loading />
        ) : listQuery.error ? (
          <ErrorState error={listQuery.error} />
        ) : rows.length === 0 ? (
          vaultEmpty ? (
            <motion.div
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-border px-4 py-12 text-center"
            >
              <Package className="mb-1 size-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">{t("explore.emptyVault.title")}</p>
              <p className="max-w-[52ch] text-sm text-muted-foreground">{t("explore.emptyVault.description")}</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <LinkButton asChild size="sm">
                  <Link to="/?packs=1">{t("explore.emptyVault.packs")}</Link>
                </LinkButton>
                <Button
                  variant="secondary"
                  size="sm"
                  pressScale={0.97}
                  onClick={() => window.dispatchEvent(new CustomEvent("basics:new-note", { detail: { type } }))}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  {t("explore.emptyVault.newNote")}
                </Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
              className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-border px-4 py-12 text-center"
            >
              <SearchX className="mb-1 size-5 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">{t("explore.empty.title")}</p>
              <p className="text-sm text-muted-foreground">{t("explore.empty.description")}</p>
              {hasFilters && (
                <Button variant="secondary" size="sm" className="mt-3" pressScale={0.97} onClick={clearFilters}>
                  {t("explore.clearFilters")}
                </Button>
              )}
            </motion.div>
          )
        ) : (
          <div
            key={view}
            role="listbox"
            tabIndex={0}
            aria-label={t("explore.notes")}
            aria-activedescendant={`note-row-${highlighted}`}
            onKeyDown={handleKeyDown}
            onMouseLeave={() => setHovered(null)}
            className="flex flex-col gap-4 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            {groups.map((group) => {
              // A group only mounts once every row before it is mounted: headings below the
              // fill line would otherwise jump down as earlier groups grow.
              if (group.start >= visibleRows) return null;
              const headingId = group.type ? `explore-group-${group.type}` : undefined;
              const items = (
                <div className={cn(view === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-2" : "flex flex-col")}>
                  <AnimatePresence mode="popLayout">
                    {group.rows.map((row, offset) => (group.start + offset < visibleRows ? renderItem(row, group.start + offset) : null))}
                  </AnimatePresence>
                </div>
              );
              if (!group.type) return <div key="all">{items}</div>;
              return (
                <fieldset key={group.type} aria-labelledby={headingId} className="m-0 min-w-0 border-0 p-0">
                  <h2
                    id={headingId}
                    className="mb-1 flex items-center gap-2 px-3 text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    <span aria-hidden="true" className="size-1.5 rounded-full" style={{ backgroundColor: typeColor(group.type) }} />
                    {typeLabel(group.type)}
                    <span className="font-mono normal-case">{group.rows.length}</span>
                  </h2>
                  {items}
                </fieldset>
              );
            })}
          </div>
        )}
      </div>
    </Page>
  );
}

interface ItemProps {
  row: Row;
  index: number;
  selected: boolean;
  reduce: boolean;
  layerTitles: Map<string, string>;
  showSource: boolean;
  onHover: () => void;
  onOpen: () => void;
}

function LayerChip({ id, title, flexible = false }: { id: string; title?: string; flexible?: boolean }) {
  const label = title ?? id;
  return (
    <span
      title={label}
      className={cn(
        "inline-flex h-5 max-w-40 items-center rounded-full border border-border px-2 font-mono text-[10.5px] text-muted-foreground",
        flexible ? "min-w-0" : "shrink-0",
      )}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * Layer pills for one entry. Chips keep their natural width: a short layer name must never
 * be cut ("Infra" must not read "Inf…"). When a nowrap row runs out of space it shows one
 * chip fewer and folds the rest into the `+n` count, so the first pill always reads whole.
 */
function LayerChips({
  layers,
  layerTitles,
  className,
  wrap = false,
}: {
  layers: string[];
  layerTitles: Map<string, string>;
  className: string;
  wrap?: boolean;
}) {
  const t = useT();
  const max = Math.min(MAX_LAYERS, layers.length);
  const layerKey = layers.join("\u0000");
  const ref = useRef<HTMLSpanElement>(null);
  const [count, setCount] = useState(max);

  // A new set of layers starts from as many pills as the row can take.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `layerKey` is the layer list identity
  useLayoutEffect(() => {
    setCount(max);
  }, [max, layerKey]);

  // Overflowing pills drop to one chip (plus `+n`) instead of being clipped or truncated.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `layerKey` re-measures on a new layer list
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || wrap || count <= 1) return;
    if (el.scrollWidth > el.clientWidth + 1) setCount(count - 1);
  }, [count, wrap, layerKey]);

  // A wider column can fit the other pill again.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || wrap) return;
    let previous = el.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      if (Math.abs(width - previous) < 1) return;
      previous = width;
      setCount(max);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [max, wrap]);

  const extra = layers.length - count;
  const hidden = layers.slice(count).map((id) => layerTitles.get(id) ?? id);
  return (
    <span ref={ref} className={className}>
      {layers.slice(0, count).map((id) => (
        <LayerChip key={id} id={id} title={layerTitles.get(id)} flexible={count === 1} />
      ))}
      {extra > 0 && (
        <span title={hidden.join(", ")} className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {t("explore.moreLayers", { count: extra })}
        </span>
      )}
    </span>
  );
}

/**
 * Tag pills for one entry. Unlike layers, a tag is never truncated: a tag either reads
 * whole or folds into `+n`, so no row ever shows a broken word like "#integrati...".
 */
function TagChips({ tags, className }: { tags: string[]; className: string }) {
  const t = useT();
  const max = Math.min(MAX_TAGS, tags.length);
  const tagKey = tags.join("\u0000");
  const ref = useRef<HTMLSpanElement>(null);
  const [count, setCount] = useState(max);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tagKey` is the tag list identity
  useLayoutEffect(() => {
    setCount(max);
  }, [max, tagKey]);

  // A tag that does not fit whole drops out; the remaining ones keep their full width.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `tagKey` re-measures on a new tag list
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || count <= 0) return;
    if (el.scrollWidth > el.clientWidth + 1) setCount(count - 1);
  }, [count, tagKey]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let previous = el.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = el.clientWidth;
      if (Math.abs(width - previous) < 1) return;
      previous = width;
      setCount(max);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [max]);

  const extra = tags.length - count;
  return (
    <span ref={ref} className={className}>
      {tags.slice(0, count).map((tag) => (
        <span
          key={tag}
          className="inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-full bg-muted px-2 font-mono text-[10px] text-muted-foreground"
        >
          #{tag}
        </span>
      ))}
      {extra > 0 && (
        <span
          title={tags
            .slice(count)
            .map((tag) => `#${tag}`)
            .join(", ")}
          className="shrink-0 font-mono text-[10px] text-muted-foreground"
        >
          {t("explore.moreTags", { count: extra })}
        </span>
      )}
    </span>
  );
}

function AgentBadge() {
  const t = useT();
  return (
    <span className="inline-flex h-5 items-center rounded-full bg-primary/12 px-2 font-mono text-[10.5px] font-medium text-primary-text">
      {t("explore.agentBadge")}
    </span>
  );
}

function SourceBadge({ source }: { source: string }) {
  const t = useT();
  if (!source) return null;
  if (source.startsWith("agent:")) {
    return (
      <span
        title={source}
        className="inline-flex h-5 max-w-full items-center truncate rounded-full bg-primary/12 px-2 font-mono text-[10px] font-medium text-primary-text"
      >
        {t("explore.agentBadge")}
      </span>
    );
  }
  if (source.startsWith("pack:")) {
    return (
      <span
        title={source}
        className="inline-flex h-5 max-w-full items-center truncate rounded-full bg-emerald-500/10 px-2 font-mono text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
      >
        {t("explore.packBadge")}
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 max-w-full items-center truncate rounded-full bg-muted/60 px-2 font-mono text-[10px] text-muted-foreground">
      {t("explore.manualBadge")}
    </span>
  );
}

function ListHeader({ sort, onSort, showSource }: { sort: Sort; onSort: (sort: Sort) => void; showSource: boolean }) {
  const t = useT();
  const sortButton = (value: Sort, label: string, className?: string) => (
    <button
      type="button"
      onClick={() => onSort(value)}
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-sm text-left transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        sort === value && "text-foreground",
        className,
      )}
    >
      <span className="truncate">{label}</span>
      {sort === value ? <ArrowDownUp className="size-2.5 shrink-0" aria-hidden="true" /> : null}
    </button>
  );

  return (
    <div
      data-list-header
      className={cn(
        listGrid(showSource),
        "mt-3 h-8 border-b border-border px-3 text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase",
      )}
    >
      <button
        type="button"
        aria-label={t("explore.sort.type")}
        title={t("explore.sort.type")}
        onClick={() => onSort("type")}
        className={cn(
          "grid size-4 place-items-center rounded-sm transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          sort === "type" && "bg-muted",
        )}
      >
        <span
          aria-hidden="true"
          className="h-4 w-[3px] rounded-full bg-[linear-gradient(to_bottom,var(--type-tech),var(--type-practice),var(--type-layer))]"
        />
      </button>
      {sortButton("title", t("explore.sort.title"))}
      <span className="hidden min-[1280px]:block truncate">{t("explore.column.layers")}</span>
      <span className="hidden min-[1280px]:block truncate">{t("explore.column.tags")}</span>
      {showSource ? (
        <span data-column="source" className="hidden min-[1280px]:block truncate">
          {t("explore.column.source")}
        </span>
      ) : null}
      {sortButton("updated", t("explore.column.updated"), "justify-end")}
    </div>
  );
}

function ListRow({ row, index, selected, reduce, layerTitles, showSource, onHover, onOpen }: ItemProps) {
  return (
    <button
      id={`note-row-${index}`}
      type="button"
      role="option"
      aria-selected={selected}
      data-note-row
      data-note-type={row.type}
      tabIndex={-1}
      onMouseEnter={onHover}
      onClick={onOpen}
      title={row.id}
      className={cn(
        listGrid(showSource),
        "group/row relative h-10 w-full scroll-mt-32 scroll-mb-24 rounded-lg border-b border-border/40 px-3 text-left outline-none last:border-b-0",
      )}
    >
      {selected && (
        <motion.span
          layoutId="explore-row-highlight"
          aria-hidden="true"
          transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
          className="absolute inset-0 rounded-lg bg-muted"
        />
      )}
      <span aria-hidden="true" className="relative h-5 w-[3px] rounded-full" style={{ backgroundColor: typeColor(row.type) }} />
      {/* The ID is not a column any more, but it stays one hover or focus away. */}
      <span className="relative flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate text-[13px] font-medium">{row.title}</span>
        <span className="hidden min-w-0 shrink-0 truncate font-mono text-[10px] text-muted-foreground group-hover/row:inline group-focus-visible/row:inline">
          {row.id}
        </span>
      </span>
      <LayerChips
        layers={row.layers}
        layerTitles={layerTitles}
        className="relative hidden min-w-0 items-center gap-1 overflow-hidden min-[1280px]:flex"
      />
      <TagChips tags={row.tags} className="relative hidden min-w-0 items-center gap-1 overflow-hidden min-[1280px]:flex" />
      {showSource ? (
        <span data-column="source" className="relative hidden min-w-0 items-center min-[1280px]:flex">
          <SourceBadge source={row.source} />
        </span>
      ) : null}
      <time
        dateTime={row.updated}
        title={row.updated}
        className="relative min-w-0 truncate text-right font-mono text-[11px] text-muted-foreground"
      >
        {row.updated ? formatCompactRelativeTime(row.updated) : "—"}
      </time>
    </button>
  );
}

function GridCard({ row, index, selected, reduce, layerTitles, onHover, onOpen }: ItemProps) {
  const t = useT();
  const extraTags = row.tags.length - MAX_TAGS;
  const extraLayers = row.layers.length - MAX_LAYERS;
  const hiddenLayers = row.layers.slice(MAX_LAYERS).map((id) => layerTitles.get(id) ?? id);
  return (
    <motion.div whileHover={reduce ? undefined : { y: -2 }} transition={SPRING_PRESS} className="h-full">
      <Card
        interactive
        selected={selected}
        size="compact"
        onMouseEnter={onHover}
        className="h-full gap-2.5 bg-muted/40 py-3.5 hover:border-foreground/20"
      >
        <CardHeader className="gap-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <TypeChip type={row.type} />
            {row.kind && <span className="truncate text-[11px] text-muted-foreground">{t(`option.${row.kind}` as TranslationKey)}</span>}
            {row.source.startsWith("agent:") && (
              <span className="ml-auto">
                <AgentBadge />
              </span>
            )}
          </div>
          <button
            id={`note-row-${index}`}
            type="button"
            role="option"
            aria-selected={selected}
            data-note-row
            data-note-type={row.type}
            tabIndex={-1}
            onClick={onOpen}
            className={cn(
              "min-w-0 scroll-mt-32 scroll-mb-24 truncate text-left text-[15px] font-semibold tracking-tight outline-none",
              CARD_TARGET_CLASS,
            )}
          >
            {row.title}
          </button>
          <span className="truncate font-mono text-[11px] text-muted-foreground">{row.id}</span>
        </CardHeader>
        <CardContent>
          <p className="line-clamp-2 min-h-[2lh] text-[13px] leading-snug text-muted-foreground">{row.excerpt}</p>
        </CardContent>
        {(row.layers.length > 0 || row.tags.length > 0) && (
          <CardFooter className="mt-auto flex-wrap gap-1">
            {row.layers.slice(0, MAX_LAYERS).map((id) => (
              <LayerChip key={id} id={id} title={layerTitles.get(id)} />
            ))}
            {extraLayers > 0 && (
              <span title={hiddenLayers.join(", ")} className="font-mono text-[10.5px] text-muted-foreground">
                {t("explore.moreLayers", { count: extraLayers })}
              </span>
            )}
            {row.tags.slice(0, MAX_TAGS).map((tag) => (
              <span
                key={tag}
                className="inline-flex h-5 items-center rounded-full bg-muted px-2 font-mono text-[10.5px] text-muted-foreground"
              >
                #{tag}
              </span>
            ))}
            {extraTags > 0 && (
              <span className="font-mono text-[10.5px] text-muted-foreground">{t("explore.moreTags", { count: extraTags })}</span>
            )}
          </CardFooter>
        )}
      </Card>
    </motion.div>
  );
}
