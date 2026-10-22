import type { NoteType } from "@marcozvd/basics-core";
import { ArrowDownUp, Layers, LayoutGrid, LayoutList, Plus, Search, SearchX } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Button } from "@/components/motion/button/base";
import { CARD_TARGET_CLASS, Card, CardContent, CardFooter, CardHeader } from "@/components/motion/card";
import { Input } from "@/components/motion/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { TypeChip } from "@/components/note-form/note-preview";
import { ErrorState, Loading } from "@/components/state";
import { type TranslationKey, useT } from "@/i18n";
import { EASE_OUT, SPRING_LAYOUT, SPRING_PRESS } from "@/lib/ease";
import { useLayers, useNotes, useSearch } from "@/lib/queries";
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
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const reduce = useReducedMotion() ?? false;
  const searchRef = useRef<HTMLInputElement>(null);

  const [searchParams, setSearchParams] = useSearchParams();
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
  const allInLayer = useNotes(layer ? { layer } : {});
  const hits = useSearch(query, filter);
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

  useEffect(() => {
    if (selected >= rows.length) setSelected(Math.max(0, rows.length - 1));
  }, [rows.length, selected]);

  useEffect(() => {
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
    <div className="flex flex-col">
      <div className="sticky top-0 z-20 bg-background px-5 pt-4 pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{t("page.explore.title")}</h1>
            <span className="font-mono text-sm text-muted-foreground">
              <AnimatedNumber value={rows.length} startOnView={false} duration={0.6} />
            </span>
          </div>

          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
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
                  title={t("explore.searchShortcut", { key: "⌘F" })}
                  className="mr-2.5 rounded-full border border-border px-1.5 font-mono text-[10px] leading-4 text-muted-foreground"
                >
                  ⌘F
                </kbd>
              }
              className="w-full sm:w-64"
              classNames={{
                field: "h-8 bg-card",
                input: "text-[13px] [&::-webkit-search-cancel-button]:hidden",
                leftIcon: "left-2.5",
              }}
            />

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

            <Button size="sm" onClick={() => window.dispatchEvent(new Event("basics:new-note"))} pressScale={0.97}>
              <Plus className="size-3.5" aria-hidden="true" />
              {t("explore.newNote")}
            </Button>
          </div>
        </div>

        <fieldset aria-label={t("explore.filters")} className="m-0 mt-3 min-w-0 border-0 p-0 flex flex-wrap items-center gap-2">
          <Tabs
            value={type ?? "all"}
            onValueChange={(value) => updateParams({ type: value === "all" ? null : value })}
            className="min-w-0 flex-auto"
            variant="pill"
          >
            <TabsList aria-label={t("explore.typeFilter")} className="bg-transparent p-0">
              <TabsTrigger value="all" className="gap-1.5 px-3 py-1 text-[12px]">
                {t("type.all")}
                <span className="font-mono text-[11px]">{allInLayer.data?.length ?? 0}</span>
              </TabsTrigger>
              {TYPE_ORDER.map((item) => (
                <TabsTrigger key={item} value={item} className="gap-1.5 px-3 py-1 text-[12px]">
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                    style={{ backgroundColor: typeColor(item) }}
                  />
                  {typeLabel(item)}
                  <span className="font-mono text-[11px]">{counts.get(item) ?? 0}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="ml-auto flex w-full items-center gap-2 sm:w-auto">
            <Select
              value={layer ?? "all"}
              onValueChange={(value) => updateParams({ layer: value === "all" ? null : value })}
              className="min-w-0 flex-1 sm:w-44 sm:flex-none"
            >
              <SelectTrigger className="h-8 rounded-full border-border bg-card px-3 py-0 text-[13px]">
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

            <Select
              value={sort}
              onValueChange={(value) => updateParams({ sort: value === DEFAULT_SORT ? null : value })}
              className="min-w-0 flex-1 sm:w-48 sm:flex-none"
            >
              <SelectTrigger className="h-8 rounded-full border-border bg-card px-3 py-0 text-[13px]">
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
          </div>
        </fieldset>
      </div>

      <div className="px-5 pt-1">
        {listQuery.isPending ? (
          <Loading />
        ) : listQuery.error ? (
          <ErrorState error={listQuery.error} />
        ) : rows.length === 0 ? (
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
              const headingId = group.type ? `explore-group-${group.type}` : undefined;
              const items = (
                <div className={cn(view === "grid" ? "grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2" : "flex flex-col")}>
                  <AnimatePresence mode="popLayout">
                    {group.rows.map((row, offset) => renderItem(row, group.start + offset))}
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
    </div>
  );
}

interface ItemProps {
  row: Row;
  index: number;
  selected: boolean;
  reduce: boolean;
  layerTitles: Map<string, string>;
  onHover: () => void;
  onOpen: () => void;
}

function LayerChip({ id, title }: { id: string; title?: string }) {
  return (
    <span className="inline-flex h-5 items-center rounded-full border border-border px-2 font-mono text-[10.5px] text-muted-foreground">
      {title ?? id}
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

function ListRow({ row, index, selected, reduce, layerTitles, onHover, onOpen }: ItemProps) {
  return (
    <button
      id={`note-row-${index}`}
      type="button"
      role="option"
      aria-selected={selected}
      data-note-row
      tabIndex={-1}
      onMouseEnter={onHover}
      onClick={onOpen}
      className="relative flex h-11 w-full scroll-mt-32 scroll-mb-24 items-center gap-3 rounded-xl px-3 text-left outline-none"
    >
      {selected && (
        <motion.span
          layoutId="explore-row-highlight"
          aria-hidden="true"
          transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
          className="absolute inset-0 rounded-xl bg-muted"
        />
      )}
      <span aria-hidden="true" className="relative h-5 w-[3px] shrink-0 rounded-full" style={{ backgroundColor: typeColor(row.type) }} />
      <span className="relative max-w-[40%] shrink-0 truncate text-sm font-medium">{row.title}</span>
      <span className="relative max-w-48 min-w-0 shrink truncate font-mono text-[11px] text-muted-foreground">{row.id}</span>
      <span className="relative min-w-0 flex-1 truncate text-[13px] text-muted-foreground">{row.excerpt}</span>
      <span className="relative flex shrink-0 items-center gap-1">
        {row.layers.map((id) => (
          <LayerChip key={id} id={id} title={layerTitles.get(id)} />
        ))}
        {row.source.startsWith("agent:") && <AgentBadge />}
      </span>
    </button>
  );
}

function GridCard({ row, index, selected, reduce, layerTitles, onHover, onOpen }: ItemProps) {
  const t = useT();
  const extraTags = row.tags.length - MAX_TAGS;
  return (
    <motion.div whileHover={reduce ? undefined : { y: -2 }} transition={SPRING_PRESS} className="h-full">
      <Card
        interactive
        selected={selected}
        size="compact"
        onMouseEnter={onHover}
        className="h-full gap-2.5 bg-card py-3.5 hover:border-foreground/20"
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
            {row.layers.map((id) => (
              <LayerChip key={id} id={id} title={layerTitles.get(id)} />
            ))}
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
