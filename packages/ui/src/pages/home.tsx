import type { ActivityEvent, NoteType, PackInfo, ProposalSummary } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, GitFork, Package } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ApprovalCard } from "@/components/agents/approval-card";
import { DOCK_SPACE } from "@/components/layout";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Button } from "@/components/motion/button/base";
import { Checkbox } from "@/components/motion/checkbox";
import { Loader } from "@/components/motion/loader";
import { MorphPopover, MorphPopoverContent, MorphPopoverTrigger } from "@/components/motion/popover-morph";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { TextReveal } from "@/components/motion/text-reveal";
import { Page } from "@/components/page";
import { ErrorState, Loading } from "@/components/state";
import { type TranslationKey, useI18n } from "@/i18n";
import { agentColor, agentInitial } from "@/lib/agent-color";
import { ApiRequestError, addPack, approveProposal, installPack, type Language, rejectProposal } from "@/lib/api";
import { SPRING_LAYOUT } from "@/lib/ease";
import { packProposer } from "@/lib/packs";
import { useActivity, useInbox, useLayers, useNotes, usePacks, useStats } from "@/lib/queries";
import { formatCompactRelativeTime, formatFullDateTime, formatRelativeTime } from "@/lib/relative-time";
import { toast } from "@/lib/toast";
import { tintStyle, typeColor } from "@/lib/type-color";

const TYPE_ORDER: NoteType[] = ["tech", "practice", "check", "profile", "project", "layer"];
const REVEAL_KEY = "basics-home-revealed";

// Tools whose activity has a localized verb; anything else falls back to its raw name.
const verbKeys: Partial<Record<string, TranslationKey>> = {
  get_note: "home.verb.get_note",
  search_vault: "home.verb.search_vault",
  recommend_stack: "home.verb.recommend_stack",
  get_stack_context: "home.verb.get_stack_context",
  propose_note: "home.verb.propose_note",
  list_layers: "home.verb.list_layers",
  list_proposals: "home.verb.list_proposals",
};

interface ActivityGroup {
  key: string;
  event: ActivityEvent;
  /** Timestamp of the most recent event merged into the group. */
  lastTs: string;
  count: number;
  noteIds: string[];
  detail?: string;
}

function isToday(value: string): boolean {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

/** Consecutive events merge while they stay within this window. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** Merge consecutive events from the same agent and tool so reads collapse into one row. */
function groupActivity(events: ActivityEvent[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  for (const event of events) {
    const previous = groups[groups.length - 1];
    const gap = previous ? Math.abs(Date.parse(previous.lastTs) - Date.parse(event.ts)) : Number.POSITIVE_INFINITY;
    if (previous && previous.event.agent === event.agent && previous.event.tool === event.tool && gap <= GROUP_WINDOW_MS) {
      previous.count += 1;
      previous.lastTs = event.ts;
      previous.noteIds = [...new Set([...previous.noteIds, ...event.noteIds])];
      if (previous.detail !== event.detail) previous.detail = undefined;
      continue;
    }
    groups.push({
      key: `${event.ts}-${event.agent}-${event.tool}-${groups.length}`,
      event,
      lastTs: event.ts,
      count: 1,
      noteIds: event.noteIds,
      detail: event.detail,
    });
  }
  return groups;
}

interface EdgeFade {
  top: boolean;
  bottom: boolean;
}

/** Height of the edge fade on the activity scroll panel. */
const FADE_PX = 24;
/** The page's own bottom rhythm (`Page` uses `pb-8`) that has to stay below the panel. */
const PAGE_BOTTOM_PX = 32;

/** Mask that fades only the edges where the list still has content to scroll to. */
function activityMask({ top, bottom }: EdgeFade): string | undefined {
  if (top && bottom) {
    return `linear-gradient(to bottom, transparent 0, #000 ${FADE_PX}px, #000 calc(100% - ${FADE_PX}px), transparent 100%)`;
  }
  if (top) return `linear-gradient(to bottom, transparent 0, #000 ${FADE_PX}px)`;
  if (bottom) return `linear-gradient(to bottom, #000 0, #000 calc(100% - ${FADE_PX}px), transparent 100%)`;
  return undefined;
}

/**
 * Height that leaves the activity panel exactly the space `<main>` has under the page
 * header: from the panel's own top edge down to the Dock clearance and the page's bottom
 * rhythm. Measuring the panel keeps the title block, grid gap and language-dependent line
 * wrapping out of the calculation. Below 1024 the stacked layout uses its CSS cap instead.
 */
function useActivityPanelHeight(ref: RefObject<HTMLElement | null>, attachKey: number): number | undefined {
  const [height, setHeight] = useState<number>();

  // Layout effect so the panel never paints at the wrong height first.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the list mounts or its content changes.
  useLayoutEffect(() => {
    const el = ref.current;
    const main = el?.closest("main");
    if (!el || !main) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      if (window.innerWidth < 1024) {
        setHeight(undefined);
        return;
      }
      const offset = el.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
      // `main.clientHeight` includes its bottom padding, which already reserves DOCK_SPACE.
      const available = main.clientHeight - DOCK_SPACE - offset - PAGE_BOTTOM_PX;
      const next = Math.round(available);
      setHeight(next > 0 ? next : undefined);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    // The page header above the panel is the only other thing whose height can move its top edge.
    const pageHeader = main.querySelector("h1")?.closest("header");
    if (pageHeader) observer.observe(pageHeader);
    window.addEventListener("resize", measure);
    void document.fonts?.ready.then(measure);
    return () => {
      cancelled = true;
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, attachKey]);

  return height;
}

function useRevealOnce(): boolean {
  const [reveal] = useState(() => {
    try {
      return sessionStorage.getItem(REVEAL_KEY) !== "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (!reveal) return;
    try {
      sessionStorage.setItem(REVEAL_KEY, "1");
    } catch {
      // Private mode: animating every mount is acceptable.
    }
  }, [reveal]);
  return reveal;
}

function SectionLabel({ children, id }: { children: string; id?: string }) {
  return (
    <h2 id={id} className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

function TypeChip({ id, type }: { id: string; type: NoteType | undefined }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/notes/${encodeURIComponent(id)}`)}
      className="inline-flex h-5 max-w-48 min-w-0 items-center rounded-full px-2 font-mono text-[10px] transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      style={tintStyle(typeColor(type))}
    >
      <span className="truncate">{id}</span>
    </button>
  );
}

const TILE_ACTION =
  "shrink-0 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

interface TileProps {
  label: string;
  value: number;
  stat: string;
  /** Note-type color for the leading dot. */
  dot?: string;
  alert?: boolean;
  onClick?: () => void;
  /** Popover details; a function receives `close` for actions that leave the popover. */
  children?: ReactNode | ((close: () => void) => ReactNode);
}

/** Compact stat tile; turns into a popover trigger when it has details to show. */
function StatTile({ label, value, stat, dot, alert, onClick, children }: TileProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const body = (
    <>
      <span className="flex min-w-0 max-w-full items-center gap-1.5 text-[11px] text-muted-foreground">
        {dot ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} /> : null}
        <span className="truncate">{label}</span>
      </span>
      <AnimatedNumber
        value={value}
        startOnView={false}
        duration={0.5}
        className={`text-sm font-semibold ${alert ? "text-destructive-text" : "text-foreground"}`}
      />
    </>
  );

  const className = `flex w-full min-w-0 flex-col items-start gap-0.5 rounded-xl border border-border bg-card/60 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`;

  if (children === undefined || value === 0) {
    return onClick ? (
      <button type="button" data-stat={stat} onClick={onClick} className={className}>
        {body}
      </button>
    ) : (
      <div data-stat={stat} className={className}>
        {body}
      </div>
    );
  }

  // The popover wraps its trigger in its own element; stretch that wrapper to fill the grid cell.
  return (
    <div className="min-w-0 *:w-full">
      <MorphPopover open={open} onOpenChange={setOpen}>
        <MorphPopoverTrigger>
          <button type="button" data-stat={stat} aria-label={`${label}: ${value} — ${t("home.showDetails")}`} className={className}>
            {body}
          </button>
        </MorphPopoverTrigger>
        <MorphPopoverContent side="top" align="start" className="w-80 p-2">
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </MorphPopoverContent>
      </MorphPopover>
    </div>
  );
}

interface StarterPacksProps {
  packs: PackInfo[] | undefined;
  pending: boolean;
  error: Error | null;
  language: Language;
  packLanguage: Language;
  selected: Set<string>;
  installing: boolean;
  /** Pack ids that currently have proposals pending in the inbox. */
  pendingPacks: Set<string>;
  onToggle: (name: string) => void;
  onLanguageChange: (language: Language) => void;
  onInstall: () => void;
}

function packDescription(pack: PackInfo, language: Language): string {
  return pack.description[language] || pack.description.en || Object.values(pack.description)[0] || "";
}

/** First-run empty state: install the official note packs in one step. */
function StarterPacks({
  packs,
  pending,
  error,
  language,
  packLanguage,
  selected,
  installing,
  pendingPacks,
  onToggle,
  onLanguageChange,
  onInstall,
}: StarterPacksProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [repoInput, setRepoInput] = useState("");
  const [added, setAdded] = useState<import("@marcozvd/basics-core").PackAddResult | null>(null);

  const add = useMutation({
    mutationFn: (repo: string) => addPack({ repo, lang: language }),
    onSuccess: (result) => {
      setAdded(result);
      setRepoInput("");
      void queryClient.invalidateQueries({ queryKey: ["packs"] });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const addError = add.error ? (add.error instanceof ApiRequestError ? add.error.body : (add.error as Error)) : null;
  const canInstall = Boolean(packs?.some((pack) => !pack.installed));
  const allInstalled = Boolean(packs?.length) && !canInstall;

  return (
    <section aria-label={t(allInstalled ? "home.packs.installedTitle" : "home.packs.title")} className="mt-6 w-full min-w-0">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted/60 text-muted-foreground">
          {allInstalled ? <Check className="size-5" aria-hidden="true" /> : <Package className="size-5" aria-hidden="true" />}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{t(allInstalled ? "home.packs.installedTitle" : "home.packs.title")}</h2>
          <p className="mt-1 max-w-[72ch] text-xs leading-5 text-muted-foreground">
            {t(allInstalled ? "home.packs.installedDescription" : "home.packs.description")}
          </p>
        </div>
      </div>

      {pending ? (
        <div className="py-8">
          <Loading />
        </div>
      ) : error ? (
        <div className="py-8">
          <ErrorState error={error} />
        </div>
      ) : packs && packs.length > 0 ? (
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-2">
          {packs.map((pack) => {
            const community = pack.origin === "github";
            const id = pack.repo ?? pack.name;
            return (
              <div
                key={id}
                data-pack={community ? id : undefined}
                className="relative flex h-full items-start gap-3 rounded-xl border border-border/70 bg-card/40 px-3 py-2.5"
              >
                {!pack.installed && !installing && !community ? (
                  <label htmlFor={`pack-${id}`} aria-label={id} className="absolute inset-0 cursor-pointer rounded-xl" />
                ) : null}
                {community ? (
                  <span
                    aria-hidden="true"
                    title={t("home.packs.github")}
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border border-border bg-muted/50 text-muted-foreground"
                  >
                    <GitFork className="size-3" strokeWidth={2.5} />
                  </span>
                ) : pack.installed ? (
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border border-border bg-muted/50 text-muted-foreground"
                  >
                    <Check className="size-3" strokeWidth={2.5} />
                  </span>
                ) : (
                  <Checkbox
                    id={`pack-${id}`}
                    checked={selected.has(pack.name)}
                    disabled={installing}
                    onCheckedChange={() => onToggle(pack.name)}
                    aria-label={id}
                    className="-mx-1 -my-0.5 rounded-lg p-1 transition-colors hover:bg-muted/40"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium">{id}</span>
                    <span className="font-mono text-[10.5px] text-muted-foreground">{t("home.packs.notes", { count: pack.notes })}</span>
                    {community ? (
                      <span className="rounded-full border border-border/70 bg-muted/60 px-1.5 py-px font-mono text-[9.5px] uppercase text-muted-foreground">
                        {t("home.packs.github")}
                      </span>
                    ) : null}
                    {pack.installed ? (
                      <span className="basis-full font-mono text-[10.5px] text-muted-foreground sm:basis-auto">
                        {t("home.packs.installed", { version: pack.installed })}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{packDescription(pack, language)}</p>
                  {community && !pack.installed && pendingPacks.has(id) ? (
                    <Link
                      to={`/inbox?pack=${encodeURIComponent(id)}`}
                      className="mt-1 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {t("home.packs.reviewInbox")}
                      <ArrowRight className="size-3" aria-hidden="true" />
                    </Link>
                  ) : null}
                  {pack.requires.length > 0 ? (
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {t("home.packs.requires", { packs: pack.requires.join(", ") })}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">{t("home.packs.none")}</p>
      )}

      <div className="mt-4 rounded-xl border border-border/70 bg-card/40 p-3">
        <label htmlFor="pack-add-repo" className="text-xs font-medium">
          {t("home.packs.addFromGithub")}
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            id="pack-add-repo"
            data-testid="pack-add-repo"
            value={repoInput}
            onChange={(event) => setRepoInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && repoInput.trim() && !add.isPending) add.mutate(repoInput.trim());
            }}
            placeholder={t("home.packs.addPlaceholder")}
            disabled={add.isPending}
            spellCheck={false}
            autoComplete="off"
            className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <Button
            size="sm"
            pressScale={0.97}
            disabled={!repoInput.trim() || add.isPending}
            onClick={() => add.mutate(repoInput.trim())}
            className="h-8 px-4"
          >
            {add.isPending ? (
              <Loader variant="spinner" size={14} label={t("home.packs.adding")} />
            ) : (
              <GitFork className="size-3.5" aria-hidden="true" />
            )}
            {t("home.packs.add")}
          </Button>
        </div>
        {addError ? (
          <p role="alert" className="mt-2 text-xs text-destructive-text">
            {addError.message}
            {"hint" in addError && addError.hint ? ` — ${addError.hint}` : ""}
          </p>
        ) : null}
        {added ? (
          <div data-testid="pack-add-result" className="mt-2 rounded-lg border border-border/60 bg-background/60 p-3">
            <p className="text-xs font-medium">{t("home.packs.added", { name: added.name, version: added.version })}</p>
            <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
              {t("home.packs.summary", {
                new: added.proposed_new.length,
                changed: added.proposed_changed.length,
                unchanged: added.unchanged.length,
                invalid: added.invalid.length,
              })}
            </p>
            {added.invalid.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-0.5">
                {added.invalid.map((item) => (
                  <li key={item.file} className="truncate font-mono text-[10px] text-muted-foreground">
                    {t("home.packs.invalidNote", { file: item.file, reason: item.reason })}
                  </li>
                ))}
              </ul>
            ) : null}
            <Link
              to={`/inbox?pack=${encodeURIComponent(added.name)}`}
              className="mt-2 inline-flex items-center gap-1 rounded-sm text-xs font-medium underline decoration-border underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("home.packs.reviewInbox")}
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {canInstall ? (
          <>
            <fieldset className="m-0 min-w-0 border-0 p-0" aria-label={t("home.packs.language")}>
              <Tabs value={packLanguage} onValueChange={(value) => onLanguageChange(value as Language)} variant="segment">
                <TabsList>
                  {(["en", "es"] as const).map((option) => (
                    <TabsTrigger key={option} value={option} className="px-2.5 py-1 text-[11px] font-medium uppercase">
                      {option}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </fieldset>
            <Button
              size="sm"
              pressScale={0.97}
              disabled={selected.size === 0 || installing || Boolean(error)}
              onClick={onInstall}
              className="h-8 px-4"
            >
              {installing ? (
                <Loader variant="spinner" size={14} label={t("home.packs.installing")} />
              ) : (
                <Package className="size-3.5" aria-hidden="true" />
              )}
              {t(selected.size === 1 ? "home.packs.installOne" : "home.packs.install", { count: selected.size })}
            </Button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("basics:new-note"))}
          className="rounded-sm text-xs text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("home.packs.createNote")}
        </button>
        {allInstalled ? (
          <Link
            to="/"
            className="rounded-sm text-xs text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("home.packs.backHome")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

export function HomePage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion() ?? false;
  const reveal = useRevealOnce();

  const stats = useStats();
  const inbox = useInbox();
  const notes = useNotes();
  const layers = useLayers();
  const timeline = useActivity({ limit: 20 });
  const dayActivity = useActivity({ limit: 200 });
  const [searchParams] = useSearchParams();
  const forcePacks = searchParams.get("packs") === "1";
  const showPacks = forcePacks || stats.data?.total === 0;
  const packs = usePacks(showPacks);

  const [selectedPacks, setSelectedPacks] = useState<Set<string>>(new Set());
  const [packLanguage, setPackLanguage] = useState<Language>(language);
  // The config request can resolve after first paint; keep the default aligned with
  // the UI language until the user picks a pack language themselves.
  useEffect(() => setPackLanguage(language), [language]);
  useEffect(() => {
    if (!packs.data) return;
    setSelectedPacks(new Set(packs.data.filter((pack) => !pack.installed).map((pack) => pack.name)));
  }, [packs.data]);

  const [armed, setArmed] = useState<string | null>(null);
  const armTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(armTimer.current), []);

  const typeById = useMemo(() => new Map((notes.data ?? []).map((note) => [note.id, note.type])), [notes.data]);
  const techById = useMemo(
    () => new Map((notes.data ?? []).map((note) => [note.id, { id: note.id, title: note.title || note.id, kind: note.kind }])),
    [notes.data],
  );
  const layerTechs = useMemo(() => {
    const map = new Map<string, { id: string; title: string; kind?: string }[]>();
    for (const layer of layers.data ?? []) {
      map.set(
        layer.id,
        layer.techs
          .map((id) => techById.get(id) ?? { id, title: id, kind: undefined })
          .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)),
      );
    }
    return map;
  }, [layers.data, techById]);

  const proposals = useMemo<ProposalSummary[]>(
    () => [...(inbox.data ?? [])].sort((a, b) => Date.parse(b.meta.created) - Date.parse(a.meta.created)).slice(0, 4),
    [inbox.data],
  );

  const groups = useMemo(() => groupActivity(timeline.data ?? []), [timeline.data]);

  const activityRef = useRef<HTMLElement>(null);
  const [activityFade, setActivityFade] = useState<EdgeFade>({ top: false, bottom: false });
  const activityHeight = useActivityPanelHeight(activityRef, groups.length);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-attach whenever the list renders — ResizeObserver then covers size changes.
  useEffect(() => {
    const el = activityRef.current;
    if (!el) return;
    const update = () => {
      const scrollable = el.scrollHeight > el.clientHeight;
      setActivityFade((prev) => {
        const next: EdgeFade = {
          top: el.scrollTop > 0,
          bottom: scrollable && el.scrollTop < el.scrollHeight - el.clientHeight - 1,
        };
        return prev.top === next.top && prev.bottom === next.bottom ? prev : next;
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [groups.length]);
  const activityMaskImage = activityMask(activityFade);

  const pendingCommunityPacks = useMemo(
    () =>
      new Set(
        (inbox.data ?? []).map((proposal) => packProposer(proposal.meta.proposed_by)?.name).filter((name): name is string => Boolean(name)),
      ),
    [inbox.data],
  );

  const agentsToday = useMemo(
    () => new Set((dayActivity.data ?? []).filter((event) => isToday(event.ts)).map((event) => event.agent)).size,
    [dayActivity.data],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => approveProposal(id),
    onSuccess: (note) => {
      invalidate();
      toast.success(t("proposal.approved"), {
        label: t("inbox.openNote"),
        onClick: () => navigate(`/notes/${encodeURIComponent(note.id)}`),
      });
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 404) {
        invalidate();
        toast.error(t("proposal.gone"));
        return;
      }
      if (error instanceof ApiRequestError && error.status === 409) {
        toast.error(t("inbox.approveConflict"));
        return;
      }
      toast.error(t("inbox.approveFailed"));
    },
  });

  const reject = useMutation({
    mutationFn: (id: string) => rejectProposal(id),
    onSuccess: () => {
      invalidate();
      toast.success(t("proposal.rejected"));
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 404) {
        invalidate();
        toast.error(t("proposal.gone"));
        return;
      }
      toast.error(t("inbox.rejectFailed"));
    },
  });

  const install = useMutation({
    mutationFn: async (names: string[]) => {
      for (const name of names) await installPack(name, packLanguage);
    },
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["packs"] });
      void queryClient.invalidateQueries({ queryKey: ["layers"] });
      void queryClient.invalidateQueries({ queryKey: ["graph"] });
      toast.success(t("home.packs.installedToast"));
      navigate("/", { replace: true });
    },
    onError: () => toast.error(t("home.packs.installFailed")),
  });

  const togglePack = (name: string) => {
    setSelectedPacks((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const requestReject = (id: string) => {
    if (armed === id) {
      window.clearTimeout(armTimer.current);
      setArmed(null);
      reject.mutate(id);
      return;
    }
    window.clearTimeout(armTimer.current);
    setArmed(id);
    armTimer.current = window.setTimeout(() => setArmed(null), 3000);
  };

  const copyMcp = async () => {
    try {
      await navigator.clipboard.writeText(`claude mcp add --transport http basics ${window.location.origin}/mcp`);
      toast.success(t("palette.copied"));
    } catch {
      toast.error(t("palette.copyFailed"));
    }
  };

  const verbFor = (group: ActivityGroup): string => {
    const { tool } = group.event;
    if (tool === "get_note" && group.count > 1) return t("home.verb.readCount", { count: group.count });
    const key = `home.verb.${tool}` as TranslationKey;
    return t(verbKeys[tool] ? key : "home.verb.other");
  };

  const counts = stats.data?.counts;
  const total = stats.data?.total ?? 0;
  const pending = stats.data?.inbox ?? 0;

  return (
    <Page>
      <header>
        {reveal ? (
          <TextReveal
            as="h1"
            text={t("home.title")}
            className="text-xl font-semibold tracking-tight"
            stagger={0.06}
            blur={8}
            yOffset="30%"
          />
        ) : (
          <h1 className="text-xl font-semibold tracking-tight">{t("home.title")}</h1>
        )}
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {t("home.summary", { total, inbox: pending, agents: agentsToday })}
        </p>
      </header>

      {showPacks ? (
        <StarterPacks
          packs={packs.data}
          pending={packs.isPending}
          error={packs.error}
          language={language}
          packLanguage={packLanguage}
          selected={selectedPacks}
          installing={install.isPending}
          pendingPacks={pendingCommunityPacks}
          onToggle={togglePack}
          onLanguageChange={setPackLanguage}
          onInstall={() => install.mutate([...selectedPacks])}
        />
      ) : (
        <div className="mt-5 grid gap-6 min-[1024px]:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] min-[1440px]:grid-cols-[minmax(0,40fr)_minmax(0,35fr)_minmax(0,25fr)] min-[1440px]:gap-5">
          <section aria-label={t("home.waiting")} className="min-w-0">
            <div className="flex items-baseline justify-between gap-3">
              <SectionLabel>{t("home.waiting")}</SectionLabel>
              <Link
                to="/inbox"
                className="inline-flex items-center gap-1 rounded-sm text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t("home.allProposals")}
                <ArrowRight className="size-3" aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-2 flex flex-col gap-2">
              {inbox.isPending ? (
                <Loading />
              ) : inbox.error ? (
                <ErrorState error={inbox.error} />
              ) : proposals.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("home.nothingToReview")}</p>
              ) : (
                <AnimatePresence initial={false} mode="popLayout">
                  {proposals.map((proposal) => {
                    const pack = packProposer(proposal.meta.proposed_by);
                    const busy =
                      (approve.isPending && approve.variables === proposal.id) || (reject.isPending && reject.variables === proposal.id);
                    return (
                      <motion.div
                        key={proposal.id}
                        layout={!reduce}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                        transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                      >
                        <ApprovalCard
                          title={proposal.title || proposal.id}
                          subtitle={proposal.id}
                          actionLabel={t(proposal.meta.action === "create" ? "proposal.action.create" : "proposal.action.update")}
                          action={proposal.meta.action}
                          typeLabel={t(`type.${proposal.type}` as TranslationKey)}
                          typeColor={`var(--type-${proposal.type})`}
                          agentName={
                            pack
                              ? t("inbox.byPack", { name: pack.name, version: pack.version })
                              : t("inbox.by", { name: proposal.meta.proposed_by })
                          }
                          agentInitial={agentInitial(proposal.meta.proposed_by)}
                          agentColor={agentColor(proposal.meta.proposed_by)}
                          agentForeground="#111113"
                          agentKind={pack ? "pack" : "agent"}
                          reason={proposal.meta.reason}
                          time={
                            <time dateTime={proposal.meta.created} title={proposal.meta.created}>
                              {formatRelativeTime(proposal.meta.created, language)}
                            </time>
                          }
                          status={busy ? "submitting" : "pending"}
                          busy={busy}
                          approveLabel={t("proposal.approve")}
                          rejectLabel={t("proposal.reject")}
                          rejectConfirmLabel={t("proposal.rejectConfirm")}
                          rejectArmed={armed === proposal.id}
                          onOpen={() => navigate(`/inbox/${encodeURIComponent(proposal.id)}`)}
                          onApprove={() => approve.mutate(proposal.id)}
                          onReject={() => requestReject(proposal.id)}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              )}
            </div>
          </section>

          <section className="min-w-0">
            <SectionLabel id="home-activity-label">{t("home.activity")}</SectionLabel>

            {timeline.isPending ? (
              <div className="mt-2">
                <Loading />
              </div>
            ) : timeline.error ? (
              <div className="mt-2">
                <ErrorState error={timeline.error} />
              </div>
            ) : groups.length === 0 ? (
              <div className="mt-2">
                <p className="text-sm text-muted-foreground">{t("home.noAgents")}</p>
                <div className="mt-2 flex items-start gap-1.5">
                  <code className="min-w-0 rounded-md bg-muted/70 px-2 py-1 font-mono text-[10.5px] leading-4 break-all text-muted-foreground">
                    claude mcp add --transport http basics {window.location.origin}/mcp
                  </code>
                  <button
                    type="button"
                    aria-label={t("home.copy")}
                    title={t("home.copy")}
                    onClick={() => void copyMcp()}
                    className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <Copy className="size-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : (
              <section
                ref={activityRef}
                // A scrollable region must be reachable from the keyboard so arrow keys can scroll it.
                // biome-ignore lint/a11y/noNoninteractiveTabindex: focusable scroll container, labelled by the section heading.
                tabIndex={0}
                aria-labelledby="home-activity-label"
                data-testid="activity-panel"
                className="mt-2 max-h-[60dvh] overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring min-[1024px]:max-h-none"
                style={{ height: activityHeight, WebkitMaskImage: activityMaskImage, maskImage: activityMaskImage }}
              >
                <ul className="mt-1 flex flex-col">
                  <AnimatePresence initial={false}>
                    {groups.map((group) => (
                      <motion.li
                        key={group.key}
                        layout={!reduce}
                        initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0 }}
                        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                        className="flex items-start gap-2 border-b border-border/50 py-1.5 last:border-0"
                      >
                        <time
                          className="w-10 shrink-0 pt-0.5 text-right font-mono text-[10px] whitespace-nowrap text-muted-foreground"
                          dateTime={group.event.ts}
                          title={formatFullDateTime(group.event.ts, language)}
                        >
                          {formatCompactRelativeTime(group.event.ts)}
                        </time>
                        <span
                          aria-hidden="true"
                          className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-md font-mono text-[10px] font-semibold text-[#111113]"
                          style={{ backgroundColor: agentColor(group.event.agent) }}
                        >
                          {agentInitial(group.event.agent)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs">
                            <span className="font-medium">{group.event.agent}</span>
                            <span className="text-muted-foreground">{verbFor(group)}</span>
                            {group.count > 1 && group.event.tool !== "get_note" ? (
                              <span className="font-mono text-[11px] text-muted-foreground">×{group.count}</span>
                            ) : null}
                            {group.event.tool === "search_vault" && group.detail ? (
                              <span className="font-mono text-[11px] text-muted-foreground">“{group.detail}”</span>
                            ) : null}
                          </div>
                          {group.noteIds.length > 0 ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {group.noteIds.slice(0, 6).map((id) => (
                                <TypeChip key={id} id={id} type={typeById.get(id)} />
                              ))}
                              {group.noteIds.length > 6 ? (
                                <span className="self-center font-mono text-[10px] text-muted-foreground">+{group.noteIds.length - 6}</span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            )}
          </section>

          <section aria-label={t("home.health")} className="min-w-0 min-[1024px]:col-span-2 min-[1440px]:col-span-1">
            <SectionLabel>{t("home.health")}</SectionLabel>
            {stats.error ? (
              <div className="mt-2">
                <ErrorState error={stats.error} />
              </div>
            ) : null}
            <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2 min-[1440px]:grid-cols-2">
              {TYPE_ORDER.map((type) => (
                <StatTile
                  key={type}
                  stat={type}
                  label={t(`type.${type}` as TranslationKey)}
                  dot={`var(--type-${type})`}
                  value={counts?.[type] ?? 0}
                  onClick={() => navigate(type === "project" ? "/projects" : `/explore?type=${type}`)}
                />
              ))}

              <StatTile
                stat="broken"
                label={t("home.brokenLinks")}
                value={stats.data?.brokenLinks.length ?? 0}
                alert={(stats.data?.brokenLinks.length ?? 0) > 0}
              >
                {(close) => (
                  <ul className="flex flex-col gap-0.5 p-1">
                    {(stats.data?.brokenLinks ?? []).map((link) => (
                      <li key={`${link.from}-${link.to}`} data-broken-link={link.to} className="flex min-w-0 items-center gap-1">
                        <span className="min-w-0 flex-1 truncate px-1.5 font-mono text-[11px] text-muted-foreground">
                          {link.from} <span className="text-foreground/50">→</span> {link.to}
                        </span>
                        <button
                          type="button"
                          aria-label={t("home.brokenLinkOpen", { id: link.from })}
                          onClick={() => navigate(`/notes/${encodeURIComponent(link.from)}`)}
                          className={TILE_ACTION}
                        >
                          {t("home.brokenLinkOpenShort")}
                        </button>
                        <button
                          type="button"
                          aria-label={t("home.brokenLinkCreate", { id: link.to })}
                          onClick={() => {
                            close();
                            window.dispatchEvent(new CustomEvent("basics:new-note", { detail: { id: link.to } }));
                          }}
                          className={`${TILE_ACTION} text-primary-text`}
                        >
                          {t("home.brokenLinkCreateShort")}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </StatTile>

              <StatTile stat="orphans" label={t("home.orphans")} value={stats.data?.orphans.length ?? 0}>
                <ul className="flex flex-col gap-0.5 p-1">
                  {(stats.data?.orphans ?? []).map((id) => (
                    <li key={id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/notes/${encodeURIComponent(id)}`)}
                        className="w-full truncate rounded-md px-1.5 py-1 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                      >
                        {id}
                      </button>
                    </li>
                  ))}
                </ul>
              </StatTile>

              <div className="min-[1440px]:hidden">
                <StatTile stat="recent" label={t("home.recent")} value={stats.data?.recent.length ?? 0}>
                  <ul className="flex flex-col gap-0.5 p-1">
                    {(stats.data?.recent ?? []).map((note) => (
                      <li key={note.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`/notes/${encodeURIComponent(note.id)}`)}
                          className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                        >
                          <span className="min-w-0 flex-1 truncate text-xs">{note.title || note.id}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{note.updated}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </StatTile>
              </div>
            </div>

            {layers.data && layers.data.length > 0 ? (
              <div className="mt-4">
                <SectionLabel>{t("home.layers")}</SectionLabel>
                <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2 min-[1440px]:grid-cols-3">
                  {layers.data.map((layer) => (
                    <StatTile
                      key={layer.id}
                      stat={`layer-${layer.id}`}
                      label={layer.title || layer.id}
                      value={layer.techs.length}
                      dot="var(--muted-foreground)"
                    >
                      {(close) => (
                        <div className="flex flex-col">
                          <ul className="flex max-h-[18rem] flex-col gap-0.5 overflow-y-auto overscroll-contain p-1">
                            {(layerTechs.get(layer.id) ?? []).map((tech) => (
                              <li key={tech.id}>
                                <button
                                  type="button"
                                  data-layer-tech={tech.id}
                                  onClick={() => {
                                    close();
                                    navigate(`/notes/${encodeURIComponent(tech.id)}`);
                                  }}
                                  className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                                >
                                  <span className="min-w-0 flex-1 truncate text-xs">{tech.title}</span>
                                  {tech.kind ? (
                                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{tech.kind}</span>
                                  ) : null}
                                </button>
                              </li>
                            ))}
                          </ul>
                          <div className="mt-1 border-t border-border/60 pt-1">
                            <Link
                              to={`/explore?type=tech&layer=${encodeURIComponent(layer.id)}`}
                              onClick={close}
                              className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-[11px] font-medium text-primary-text transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                            >
                              {t("home.viewInExplore")}
                              <ArrowRight aria-hidden="true" className="size-3.5" />
                            </Link>
                          </div>
                        </div>
                      )}
                    </StatTile>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 hidden min-w-0 min-[1440px]:block">
              <SectionLabel>{t("home.recent")}</SectionLabel>
              <ul className="mt-1 flex flex-col">
                {(stats.data?.recent ?? []).map((note) => (
                  <li key={note.id} className="border-b border-border/50 last:border-0">
                    <button
                      type="button"
                      onClick={() => navigate(`/notes/${encodeURIComponent(note.id)}`)}
                      className="flex w-full min-w-0 items-baseline gap-2 py-1.5 text-left transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 self-center rounded-full"
                        style={{ backgroundColor: typeColor(note.type) }}
                      />
                      <span className="min-w-0 flex-1 truncate text-xs">{note.title || note.id}</span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{note.updated}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}
    </Page>
  );
}
