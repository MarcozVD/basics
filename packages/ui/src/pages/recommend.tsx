import type { ExportFile, Recommendation } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronDown, Copy, FileDown, Info, MessageSquareText, Plus, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router";
import { PromptInput } from "@/components/agents/prompt-input";
import { EXPORT_TARGETS, ExportModal } from "@/components/export-modal";
import {
  AdaptiveStepper,
  AdaptiveStepperDecrement,
  AdaptiveStepperIncrement,
  AdaptiveStepperValue,
} from "@/components/motion/adaptive-stepper";
import { Button } from "@/components/motion/button/base";
import { CARD_TARGET_CLASS, Card, CardContent, CardHeader } from "@/components/motion/card";
import { Checkbox } from "@/components/motion/checkbox";
import { Loader } from "@/components/motion/loader";
import { Tooltip } from "@/components/motion/tooltip";
import { PAGE_SECTIONS, Page, Reveal } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { AgentPanel } from "@/components/recommend/agent-panel";
import { CreateProjectDialog } from "@/components/recommend/create-project-dialog";
import { ErrorState } from "@/components/state";
import { Button as LinkButton } from "@/components/ui/button";
import { type TranslationKey, useT } from "@/i18n";
import { resetAgentRun } from "@/lib/agent-run";
import { enableEmbeddings, exportStack, recommend } from "@/lib/api";
import { modChord } from "@/lib/desktop";
import { EASE_OUT, SPRING_PANEL } from "@/lib/ease";
import { useEmbeddingsProgress } from "@/lib/events";
import { useIntro } from "@/lib/intro";
import { DOCK_SPACE, useResolvedDockEdge } from "@/lib/navigation";
import { useDocumentTitle } from "@/lib/page-title";
import { queryKeys, useEmbeddings, useLayers, useNotes, useStats } from "@/lib/queries";
import { buildShortlist, type ShortlistCard } from "@/lib/recommend-shortlist";
import { clearRecommend, updateAgent, updateRecommend, useRecommendStore } from "@/lib/recommend-store";
import { useReturnFocus } from "@/lib/return-focus";
import { toast } from "@/lib/toast";
import { tintStyle } from "@/lib/type-color";
import { cn } from "@/lib/utils";

const EXAMPLES = ["recommend.example.api", "recommend.example.ml", "recommend.example.web"] as const;
const EMBEDDINGS_CLI = "basics embeddings enable";

/** Round download sizes the way the enable prompt describes them (~500 MB). */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/** Cards keep their own width and wrap into rows, so a short layer leaves no dead column. */
const CARD_GRID = "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]";
/** Profiles keep their column width even when only one matches. */
const PROFILE_COLUMNS = "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]";
/** Only the first cards of a layer stagger in; the rest appear with them. */
const STAGGER_LIMIT = 10;
const STAGGER_STEP = 0.02;
/** The selection pill floats 20px off the window's bottom edge, inside the content panel. */
const BAR_BOTTOM = 20;
/** How many phrases a reason line shows before it says how many more there are. */
const REASON_LIMIT = 2;

const enter = (index: number, reduce: boolean) => ({
  initial: index < STAGGER_LIMIT ? { opacity: 0, y: reduce ? 0 : 6 } : false,
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, ease: EASE_OUT, delay: Math.min(index, STAGGER_LIMIT) * STAGGER_STEP },
});

function TechChip({ id, title }: { id: string; title?: string }) {
  return (
    <span
      title={id}
      className="inline-flex h-5 items-center rounded-full px-2 font-mono text-[11px] font-medium"
      style={tintStyle("var(--type-tech)")}
    >
      {title || id}
    </span>
  );
}

/** Words first, a quiet sentence. Numbers live only in the per-card "Why" disclosure. */
function ReasonLine({ label, phrases }: { label: string; phrases: string[] }) {
  if (phrases.length === 0) return null;
  const shown = phrases.slice(0, REASON_LIMIT).join(" · ");
  const rest = phrases.length - REASON_LIMIT;
  return (
    <p className="text-[12px] leading-4 text-muted-foreground">
      <span className="font-medium text-foreground">{label}:</span> {shown}
      {rest > 0 ? ` +${rest}` : null}
    </p>
  );
}

/**
 * The note's own avoid_when matched. Amber icon, muted text and no red card
 * border: it is a reason to look closer, not a verdict against the tech.
 */
function WatchOutLine({ label, phrases }: { label: string; phrases: string[] }) {
  if (phrases.length === 0) return null;
  const shown = phrases.slice(0, REASON_LIMIT).join(" · ");
  const rest = phrases.length - REASON_LIMIT;
  return (
    <p className="flex items-start gap-1.5 text-[12px] leading-4 text-muted-foreground">
      <AlertTriangle className="mt-px size-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
      <span>
        <span className="font-medium text-foreground">{label}:</span> {shown}
        {rest > 0 ? ` +${rest}` : null}
      </span>
    </p>
  );
}

interface CandidateCardProps {
  card: ShortlistCard;
  title: string;
  layerTitleOf: (id: string) => string;
  profileFits: string[];
  selected: boolean;
  onToggle: () => void;
}

function ModeIndicator({ mode }: { mode: Recommendation["mode"] }) {
  const t = useT();
  const hybrid = mode === "hybrid";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", hybrid ? "bg-primary" : "bg-muted-foreground/60")} />
      {t(hybrid ? "recommend.mode.hybrid" : "recommend.mode.keywords")}
    </span>
  );
}

function CandidateCard({ card, title, layerTitleOf, profileFits, selected, onToggle }: CandidateCardProps) {
  const t = useT();
  const { candidate, alsoLayers } = card;
  const breakdown = candidate.score_breakdown;
  const matches = [...candidate.matched_use_when, ...candidate.matched_performs_best];
  const watchOut = [...new Set([...candidate.matched_avoid_when, ...candidate.negated_use_when, ...candidate.negated_avoid_when])];
  const parts: { label: string; value: string }[] = [
    { label: t("recommend.breakdown.keywords"), value: String(breakdown.keywords) },
    { label: t("recommend.breakdown.text"), value: String(breakdown.text) },
    { label: t("recommend.breakdown.synonyms"), value: String(breakdown.synonyms) },
    ...(breakdown.semantic === undefined ? [] : [{ label: t("recommend.breakdown.semantic"), value: breakdown.semantic.toFixed(3) }]),
    { label: t("recommend.breakdown.negation"), value: String(breakdown.negation) },
    { label: t("recommend.breakdown.language"), value: String(breakdown.language) },
  ];
  return (
    <Card interactive selected={selected} size="compact" className="h-full gap-2.5 bg-muted/40 py-3 hover:border-foreground/20">
      <CardHeader className="gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="relative z-10 flex pt-0.5">
            <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={t("recommend.select", { title })} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <Link
                to={`/notes/${encodeURIComponent(candidate.id)}`}
                aria-label={t("recommend.open", { title })}
                className={cn("min-w-0 truncate text-sm font-semibold tracking-tight outline-none", CARD_TARGET_CLASS)}
              >
                {title}
              </Link>
              <span className="truncate font-mono text-[11px] text-muted-foreground">{candidate.id}</span>
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
              <span>{layerTitleOf(card.layer)}</span>
              <span aria-hidden="true">·</span>
              <span>{t(`option.${candidate.kind}` as TranslationKey)}</span>
              {alsoLayers.length > 0 ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{t("recommend.alsoFits", { layers: alsoLayers.map((layer) => layerTitleOf(layer)).join(", ") })}</span>
                </>
              ) : null}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <ReasonLine label={t("recommend.matches")} phrases={matches} />
        {profileFits.length > 0 ? (
          <p className="text-[12px] leading-4 text-muted-foreground">
            <span className="font-medium text-foreground">{t("recommend.fitsProfile")}:</span> {profileFits.join(" · ")}
          </p>
        ) : null}
        <WatchOutLine label={t("recommend.watchOut")} phrases={watchOut} />
      </CardContent>
      <CardContent className="border-t border-border/60 pt-2">
        <details className="group">
          <summary className="relative z-10 inline-flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <ChevronDown
              aria-hidden="true"
              className={cn("size-3 shrink-0 -rotate-90 transition-transform motion-reduce:transition-none", "group-open:rotate-0")}
            />
            {t("recommend.why")}
          </summary>
          <p className="relative z-10 mt-1.5 max-w-[60ch] text-[11px] leading-4 text-muted-foreground">{t("recommend.why.lead")}</p>
          <dl className="relative z-10 mt-1.5 grid w-fit grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[11px] leading-4">
            {parts.map((part) => (
              <div key={part.label} className="contents">
                <dt className="text-muted-foreground">{part.label}</dt>
                <dd className="text-right font-mono tabular-nums text-foreground">{part.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      </CardContent>
    </Card>
  );
}

interface ResultsProps {
  recommendation: Recommendation;
  titleOf: (id: string) => string;
  primaryLayerOf: (id: string) => string | undefined;
  layerTitle: (id: string) => string;
  selected: Set<string>;
  reduce: boolean;
  onToggle: (id: string) => void;
  onUseProfile: (profileId: string, stack: Record<string, string[]>) => void;
}

function RecommendationResults({
  recommendation,
  titleOf,
  primaryLayerOf,
  layerTitle,
  selected,
  reduce,
  onToggle,
  onUseProfile,
}: ResultsProps) {
  const t = useT();
  // A tech that matches two layers shows once, under its primary layer, and says
  // where else it fits. A layer whose cards all moved away renders nothing.
  const sections = buildShortlist(recommendation.layers, primaryLayerOf);
  const profileFits = new Map<string, string[]>();
  for (const profile of recommendation.profiles) {
    const title = titleOf(profile.id);
    for (const tech of new Set(Object.values(profile.stack).flat())) {
      profileFits.set(tech, [...(profileFits.get(tech) ?? []), title]);
    }
  }
  const hasWatchOut = sections.some((section) =>
    section.cards.some(
      (card) =>
        card.candidate.matched_avoid_when.length + card.candidate.negated_use_when.length + card.candidate.negated_avoid_when.length > 0,
    ),
  );

  return (
    <div className="flex flex-col gap-6">
      {recommendation.profiles.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("recommend.profiles")}</h2>
          <div className={PROFILE_COLUMNS}>
            {recommendation.profiles.map((profile, index) => (
              <motion.div key={profile.id} {...enter(index, reduce)} className="min-w-0">
                <Card size="compact" className="h-full gap-3 bg-muted/40 py-3.5">
                  <CardHeader>
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                      <Link
                        to={`/notes/${encodeURIComponent(profile.id)}`}
                        className="min-w-0 truncate text-[15px] font-semibold tracking-tight hover:underline"
                      >
                        {titleOf(profile.id)}
                      </Link>
                      <span className="truncate font-mono text-[11px] text-muted-foreground">{profile.id}</span>
                      <Button
                        variant="secondary"
                        size="sm"
                        pressScale={0.97}
                        className="ml-auto h-7 shrink-0"
                        onClick={() => onUseProfile(profile.id, profile.stack)}
                      >
                        {t("recommend.useProfile")}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-1.5">
                    {Object.entries(profile.stack).map(([layer, techs]) => (
                      <div key={layer} className="flex min-w-0 items-center gap-2">
                        <span className="w-20 shrink-0 truncate text-[11px] text-muted-foreground">{layerTitle(layer)}</span>
                        <span className="flex min-w-0 flex-wrap gap-1">
                          {techs.map((tech) => (
                            <TechChip key={tech} id={tech} title={titleOf(tech)} />
                          ))}
                        </span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("recommend.perLayer")}</h2>
          {hasWatchOut ? (
            <p className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
              <AlertTriangle className="mt-px size-3 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
              {t("recommend.legend.watchOut")}
            </p>
          ) : null}
        </div>
        {sections.length > 0 ? (
          sections.map((section) => {
            const headingId = `recommend-layer-${section.layer}`;
            return (
              <section key={section.layer} aria-labelledby={headingId} className="flex min-w-0 flex-col gap-2.5">
                <h3 id={headingId} className="px-1 text-sm font-semibold tracking-tight">
                  {layerTitle(section.layer)}
                </h3>
                <div className={CARD_GRID}>
                  {section.cards.map((card, index) => (
                    <motion.div key={card.candidate.id} {...enter(index, reduce)} className="min-w-0">
                      <CandidateCard
                        card={card}
                        title={titleOf(card.candidate.id)}
                        layerTitleOf={layerTitle}
                        profileFits={profileFits.get(card.candidate.id) ?? []}
                        selected={selected.has(card.candidate.id)}
                        onToggle={() => onToggle(card.candidate.id)}
                      />
                    </motion.div>
                  ))}
                </div>
              </section>
            );
          })
        ) : (
          <p className="text-sm text-muted-foreground">{t("recommend.noResults")}</p>
        )}
      </section>

      <p className="max-w-[72ch] text-xs text-muted-foreground">
        {t(recommendation.mode === "hybrid" ? "recommend.note.hybrid" : "recommend.note")}
      </p>
    </div>
  );
}

function ResultsSkeleton({ layers, perLayer, label }: { layers: string[]; perLayer: number; label: string }) {
  const block = "rounded-2xl border bg-muted/40 motion-safe:animate-pulse";
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-2.5">
        <div className="h-3 w-16 rounded-full bg-muted" />
        <div className={PROFILE_COLUMNS}>
          <div className={cn(block, "h-[122px]")} />
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <div className="h-3 w-16 rounded-full bg-muted" />
        {layers.map((layer) => (
          <div key={layer} className="flex flex-col gap-2.5">
            <div className="mx-1 h-4 w-24 rounded-full bg-muted" />
            <div className={CARD_GRID}>
              {Array.from({ length: perLayer }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity.
                <div key={index} className={cn(block, "h-[92px]")} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecommendPage() {
  const t = useT();
  useDocumentTitle(t("page.recommend.title"));
  const reduce = useReducedMotion() ?? false;
  const dockEdge = useResolvedDockEdge();
  // The selection pill sits above the floating bar when it rests on the bottom edge.
  const barBottom = BAR_BOTTOM + (dockEdge === "bottom" ? DOCK_SPACE : 0);
  const layersQuery = useLayers();
  // Titles and the note's own first layer come from the summaries Explore already loads.
  const notes = useNotes();
  const stats = useStats();
  const vaultEmpty = stats.data?.total === 0;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const store = useRecommendStore();
  const queryClient = useQueryClient();
  const [files, setFiles] = useState<ExportFile[]>([]);
  const [stackIds, setStackIds] = useState<string[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  const agentOpen = store.agent.open;
  const setAgentOpen = (open: boolean) => updateAgent({ open });
  const generateRef = useRef<HTMLButtonElement>(null);
  const createRef = useRef<HTMLButtonElement>(null);
  useReturnFocus(dialogOpen, generateRef);
  useReturnFocus(createOpen, createRef);

  const { description, selectedLayers, perLayer, exportTab, recommendation } = store;
  const intro = useIntro("recommend", Boolean(recommendation));
  const selected = useMemo(() => new Set(store.selected), [store.selected]);
  const setDescription = (value: string) => updateRecommend({ description: value });
  const setPerLayer = (value: number) => updateRecommend({ perLayer: value });
  const setExportTab = (value: string) => updateRecommend({ exportTab: value });

  const layerIds = useMemo(() => (layersQuery.data ?? []).map((layer) => layer.id), [layersQuery.data]);
  const layerTitles = useMemo(
    () => new Map((layersQuery.data ?? []).map((layer) => [layer.id, layer.title || layer.id])),
    [layersQuery.data],
  );
  const noteTitles = useMemo(() => new Map((notes.data ?? []).map((note) => [note.id, note.title || note.id])), [notes.data]);
  const noteLayers = useMemo(() => new Map((notes.data ?? []).map((note) => [note.id, note.layers])), [notes.data]);
  const activeLayers = selectedLayers ?? layerIds;
  const allLayers = layerIds.length > 0 && activeLayers.length === layerIds.length;
  const layersSummary = t(allLayers ? "recommend.layersSummary.all" : "recommend.layersSummary.some", {
    count: perLayer,
    selected: activeLayers.length,
    total: layerIds.length,
  });

  /** Only the opt-in prompt needs the embeddings state, so it is fetched lazily. */
  const embeddings = useEmbeddings(recommendation?.mode === "keywords");

  const run = useMutation({
    mutationFn: recommend,
    onSuccess: (data) => updateRecommend({ recommendation: data, selected: [] }),
  });

  /** One-click `basics embeddings enable`; on success the same description is re-ranked as hybrid. */
  const enableSemantic = useMutation({
    mutationFn: enableEmbeddings,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.embeddings });
      toast.success(t("recommend.enableHybrid.success"));
      if (description.trim() && activeLayers.length > 0) {
        run.mutate({ description: description.trim(), layers: activeLayers, perLayer });
      }
    },
    onError: () => toast.error(t("recommend.enableHybrid.failed")),
  });
  const enableProgress = useEmbeddingsProgress(enableSemantic.isPending);

  const exportFiles = useMutation({
    mutationFn: (ids: string[]) => exportStack(ids, EXPORT_TARGETS),
    onSuccess: (data, ids) => {
      setFiles(data);
      setStackIds(ids);
      setExportTab("stack");
      setDialogOpen(true);
    },
    onError: () => toast.error(t("recommend.exportFailed")),
  });

  const toggleLayer = (id: string) => {
    updateRecommend({
      selectedLayers: activeLayers.includes(id) ? activeLayers.filter((layer) => layer !== id) : [...activeLayers, id],
    });
  };

  const toggleTech = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    updateRecommend({ selected: [...next] });
  };

  const useProfile = (profileId: string, stack: Record<string, string[]>) => {
    updateRecommend({ selected: [...new Set(Object.values(stack).flat())], fromProfile: profileId });
  };

  /** Add the techs an agent answer cited (`[[id]]`) to the current selection. */
  const selectMentioned = (ids: string[]) => {
    updateRecommend({ selected: [...new Set([...selected, ...ids])] });
  };

  const clear = () => {
    run.reset();
    exportFiles.reset();
    setFiles([]);
    setStackIds([]);
    setDialogOpen(false);
    setCreateOpen(false);
    resetAgentRun();
    clearRecommend();
  };

  const submit = (value: string) => {
    if (!value.trim() || activeLayers.length === 0 || run.isPending) return;
    run.mutate({ description: value.trim(), layers: activeLayers, perLayer });
  };

  const fillExample = (text: string) => {
    setDescription(text);
    inputRef.current?.focus();
  };

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("recommend.copied"));
    } catch {
      toast.error(t("recommend.copyFailed"));
    }
  };

  const layerTitle = (id: string) => layerTitles.get(id) ?? id;
  const titleOf = (id: string) => noteTitles.get(id) ?? id;
  const primaryLayerOf = (id: string) => noteLayers.get(id)?.[0];

  /** Turn the currently selected techs into a per-layer stack for the project prefill. */
  const stackFromSelected = (): Record<string, string[]> => {
    const stack: Record<string, string[]> = {};
    if (!recommendation) return stack;
    for (const [layer, candidates] of Object.entries(recommendation.layers)) {
      const ids = candidates.map((candidate) => candidate.id).filter((id) => selected.has(id));
      if (ids.length > 0) stack[layer] = ids;
    }
    return stack;
  };

  const projectPrefill = {
    description: store.description,
    profile: store.fromProfile ?? undefined,
    stack: stackFromSelected(),
    reason: recommendation?.note,
  };

  return (
    <div className="min-h-full">
      <Page className={cn(PAGE_SECTIONS, selected.size > 0 && "pb-16")}>
        <Reveal index={0}>
          <PageHeader
            title={t("page.recommend.title")}
            meta={recommendation ? <ModeIndicator mode={recommendation.mode} /> : null}
            description={intro.showIntro ? t("recommend.intro") : undefined}
            hint={intro.showIntro ? undefined : t("recommend.intro")}
            onDismissDescription={intro.showIntro ? intro.dismiss : undefined}
            action={
              <>
                {recommendation?.mode === "keywords" ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    pressScale={0.97}
                    className="h-7 px-2.5"
                    disabled={enableSemantic.isPending}
                    onClick={() => enableSemantic.mutate()}
                  >
                    {enableSemantic.isPending ? (
                      <Loader variant="spinner" size={14} label={t("recommend.enableHybrid.working")} />
                    ) : (
                      <Sparkles className="size-3.5" aria-hidden="true" />
                    )}
                    {t("recommend.enableHybrid")}
                  </Button>
                ) : null}
                {(description.trim() || recommendation) && (
                  <Button variant="ghost" size="sm" pressScale={0.97} className="h-7 px-2.5" onClick={clear}>
                    {t("recommend.reset")}
                  </Button>
                )}
              </>
            }
          >
            {recommendation?.mode === "keywords" ? (
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                {embeddings.data ? (
                  <p>
                    {t("recommend.enableHybrid.explain", {
                      model: embeddings.data.model,
                      size: formatBytes(embeddings.data.download.total),
                    })}
                  </p>
                ) : null}
                {enableSemantic.isPending ? (
                  <p role="status" className="flex items-center gap-1.5">
                    <Loader variant="spinner" size={12} label={t("recommend.enableHybrid.working")} />
                    {enableProgress
                      ? t("recommend.enableHybrid.progress", { done: enableProgress.done, total: enableProgress.total })
                      : t("recommend.enableHybrid.working")}
                  </p>
                ) : null}
                {enableSemantic.isError ? (
                  <p role="alert" className="text-destructive">
                    {enableSemantic.error instanceof Error ? enableSemantic.error.message : t("recommend.enableHybrid.failed")}
                  </p>
                ) : null}
                <button
                  type="button"
                  aria-label={`${t("recommend.copyCli")}: ${EMBEDDINGS_CLI}`}
                  title={t("recommend.copyCli")}
                  onClick={() => void copyText(EMBEDDINGS_CLI)}
                  className="mt-0.5 inline-flex h-6 max-w-full items-center gap-1.5 self-start rounded-md border border-border bg-muted/60 px-2 font-mono text-[11px] text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="truncate">{EMBEDDINGS_CLI}</span>
                  <Copy className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </div>
            ) : null}
          </PageHeader>
        </Reveal>

        <Reveal index={1}>
          <PromptInput
            ref={inputRef}
            value={description}
            onValueChange={setDescription}
            onSubmit={submit}
            submitOn="mod-enter"
            keepValueOnSubmit
            loading={run.isPending}
            loadingIndicator={<Loader variant="spinner" size={14} label={t("recommend.loading")} />}
            submitLabel={t("recommend.submit")}
            showSubmitLabel
            aria-label={t("recommend.description")}
            aria-keyshortcuts="Meta+Enter Control+Enter"
            placeholder={t("recommend.placeholder")}
            minRows={2}
            maxRows={8}
            className="bg-muted/50"
            trailingAction={
              <Button
                variant="secondary"
                size="sm"
                pressScale={0.97}
                className="h-8"
                aria-expanded={agentOpen}
                onClick={() => setAgentOpen(!agentOpen)}
              >
                <MessageSquareText className="size-3.5" aria-hidden="true" />
                {t("recommend.agent.open")}
              </Button>
            }
            leadingAction={
              <kbd className="ml-2 rounded-full border border-border px-1.5 font-mono text-[11px] leading-4 text-muted-foreground">
                {t("recommend.shortcut", { combo: modChord("↵") })}
              </kbd>
            }
          />
        </Reveal>

        <Reveal index={2}>
          {layerIds.length > 0 ? (
            <div className="flex flex-col items-start gap-3">
              <button
                type="button"
                aria-expanded={layersOpen}
                aria-controls="recommend-layers"
                onClick={() => setLayersOpen((open) => !open)}
                className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-border px-3 text-[12px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <ChevronDown
                  aria-hidden="true"
                  className={cn("size-3.5 shrink-0 transition-transform motion-reduce:transition-none", !layersOpen && "-rotate-90")}
                />
                <span className="truncate">{layersSummary}</span>
              </button>

              {layersOpen ? (
                <div id="recommend-layers" className="flex w-full flex-wrap items-center gap-x-5 gap-y-2">
                  <fieldset
                    aria-label={t("recommend.layers")}
                    className="m-0 flex min-w-0 flex-1 basis-80 flex-wrap items-center gap-1.5 border-0 p-0"
                  >
                    <span className="mr-1 text-xs text-muted-foreground">{t("recommend.layers")}</span>
                    {(layersQuery.data ?? []).map((layer) => {
                      const active = activeLayers.includes(layer.id);
                      return (
                        <motion.button
                          key={layer.id}
                          type="button"
                          aria-pressed={active}
                          onClick={() => toggleLayer(layer.id)}
                          whileTap={reduce ? undefined : { scale: 0.97 }}
                          className={cn(
                            "inline-flex h-7 items-center gap-1 rounded-full border px-3 text-[12px] font-medium transition-colors",
                            "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                            active
                              ? "border-foreground/15 bg-foreground/[0.07] text-foreground"
                              : "border-border text-muted-foreground hover:text-foreground",
                          )}
                        >
                          {active && <Check className="size-3" aria-hidden="true" />}
                          {layer.title || layer.id}
                        </motion.button>
                      );
                    })}
                  </fieldset>

                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <span aria-hidden="true">{t("recommend.perLayer")}</span>
                      <Tooltip content={t("recommend.perLayer.hint")}>
                        <button
                          type="button"
                          aria-label={t("recommend.perLayer.hint")}
                          className="grid size-3.5 cursor-help place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          <Info className="size-3" aria-hidden="true" />
                        </button>
                      </Tooltip>
                    </span>
                    {/* The stepper's liquid geometry is drawn at 48px; scaled to the 32px filter row. */}
                    <div className="h-8 w-36">
                      <div className="w-[13.5rem] origin-top-left scale-[0.6667]">
                        <AdaptiveStepper
                          value={perLayer}
                          onValueChange={setPerLayer}
                          min={1}
                          max={10}
                          fill="var(--muted)"
                          aria-label={t("recommend.perLayer")}
                          formatLegend={(valueText) => t("recommend.perLayerLegend", { value: valueText })}
                        >
                          <AdaptiveStepperDecrement aria-label={t("recommend.decreasePerLayer")} />
                          <AdaptiveStepperValue />
                          <AdaptiveStepperIncrement aria-label={t("recommend.increasePerLayer")} />
                        </AdaptiveStepper>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </Reveal>

        <AnimatePresence initial={false}>
          {agentOpen ? (
            <motion.div
              key="ask-agent"
              initial={{ opacity: 0, y: reduce ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduce ? 0 : 6, transition: { duration: 0.12, ease: EASE_OUT } }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
            >
              <AgentPanel
                description={description}
                layers={activeLayers}
                onSelectTechs={selectMentioned}
                onClose={() => setAgentOpen(false)}
              />{" "}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className="mt-2">
          {run.isPending && recommendation ? (
            <div className="flex flex-col gap-2">
              <p aria-hidden="true" className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader variant="spinner" size={12} label="" />
                {t("recommend.loading")}
              </p>
              {/* Keep the previous shortlist visible and dimmed instead of blanking the page. */}
              <div aria-busy="true" inert className="pointer-events-none opacity-50 transition-opacity">
                <RecommendationResults
                  recommendation={recommendation}
                  titleOf={titleOf}
                  primaryLayerOf={primaryLayerOf}
                  layerTitle={layerTitle}
                  selected={selected}
                  reduce={reduce}
                  onToggle={toggleTech}
                  onUseProfile={useProfile}
                />
              </div>
            </div>
          ) : run.isPending ? (
            <ResultsSkeleton layers={activeLayers} perLayer={Math.min(perLayer, 4)} label={t("recommend.loading")} />
          ) : run.error ? (
            <ErrorState error={run.error} />
          ) : recommendation ? (
            <RecommendationResults
              recommendation={recommendation}
              titleOf={titleOf}
              primaryLayerOf={primaryLayerOf}
              layerTitle={layerTitle}
              selected={selected}
              reduce={reduce}
              onToggle={toggleTech}
              onUseProfile={useProfile}
            />
          ) : vaultEmpty ? (
            <div className="flex flex-col items-start gap-3 pt-2">
              <p className="max-w-[72ch] text-sm text-muted-foreground">{t("recommend.emptyVault.description")}</p>
              <LinkButton asChild size="sm">
                <Link to="/?packs=1">{t("recommend.emptyVault.action")}</Link>
              </LinkButton>
            </div>
          ) : run.isPending ? null : (
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-muted-foreground">{t("recommend.examples")}</span>
                {EXAMPLES.map((key) => (
                  <motion.button
                    key={key}
                    type="button"
                    onClick={() => fillExample(t(key))}
                    whileTap={reduce ? undefined : { scale: 0.97 }}
                    className={cn(
                      "inline-flex h-7 max-w-full min-w-0 items-center rounded-full border border-border bg-muted/60 px-3 text-[12px] text-muted-foreground transition-colors",
                      "hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                    )}
                  >
                    <span className="truncate">{t(key)}</span>
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </div>
      </Page>

      {typeof document === "undefined"
        ? null
        : createPortal(
            <AnimatePresence>
              {selected.size > 0 && (
                <motion.div
                  role="region"
                  aria-label={t("recommend.selectedBar")}
                  initial={{ opacity: 0, y: reduce ? 0 : 8, x: "-50%" }}
                  animate={{ opacity: 1, y: 0, x: "-50%" }}
                  exit={{ opacity: 0, y: reduce ? 0 : 8, x: "-50%", transition: { duration: 0.12, ease: EASE_OUT } }}
                  transition={reduce ? { duration: 0.12 } : SPRING_PANEL}
                  style={{ bottom: barBottom }}
                  className="fixed left-1/2 z-40 flex items-center gap-1 rounded-full border bg-card/85 py-1 pr-1 pl-1 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl"
                >
                  <button
                    type="button"
                    aria-label={t("recommend.clear")}
                    onClick={() => updateRecommend({ selected: [] })}
                    className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </button>
                  <span className="pr-2 text-[13px] font-medium tabular-nums">{t("recommend.selected", { count: selected.size })}</span>
                  <span aria-hidden="true" className="text-muted-foreground/60">
                    ·
                  </span>
                  <Button
                    ref={createRef}
                    variant="secondary"
                    size="sm"
                    pressScale={0.97}
                    className="ml-0.5"
                    onClick={() => setCreateOpen(true)}
                  >
                    <Plus className="size-3.5" aria-hidden="true" />
                    {t("recommend.createProject")}
                  </Button>
                  <Button
                    ref={generateRef}
                    size="sm"
                    pressScale={0.97}
                    className="ml-1"
                    disabled={exportFiles.isPending}
                    onClick={() => exportFiles.mutate([...selected])}
                  >
                    {exportFiles.isPending ? (
                      <Loader variant="spinner" size={14} label={t("state.loading")} />
                    ) : (
                      <FileDown className="size-3.5" aria-hidden="true" />
                    )}
                    {t("recommend.generate")}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>,
            document.body,
          )}

      <ExportModal
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        files={files}
        stackIds={stackIds}
        tab={exportTab}
        onTabChange={setExportTab}
      />

      <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} prefill={projectPrefill} />
    </div>
  );
}
