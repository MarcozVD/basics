import type { Candidate, ExportFile, Recommendation } from "@marcozvd/basics-core";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Ban, Check, Copy, Download, FileDown, type LucideIcon, Star, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { CodeBlock } from "@/components/agents/code-block";
import { PromptInput } from "@/components/agents/prompt-input";
import { DOCK_SPACE } from "@/components/layout";
import {
  AdaptiveStepper,
  AdaptiveStepperDecrement,
  AdaptiveStepperIncrement,
  AdaptiveStepperValue,
} from "@/components/motion/adaptive-stepper";
import { Button } from "@/components/motion/button/base";
import { CARD_TARGET_CLASS, Card, CardContent, CardHeader } from "@/components/motion/card";
import { CenterMorphModal, CenterMorphModalContent } from "@/components/motion/center-morph-modal";
import { Checkbox } from "@/components/motion/checkbox";
import { Loader } from "@/components/motion/loader";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { ErrorState } from "@/components/state";
import { type TranslationKey, useT } from "@/i18n";
import { exportStack, recommend } from "@/lib/api";
import { EASE_OUT, SPRING_PANEL } from "@/lib/ease";
import { useLayers } from "@/lib/queries";
import { useReturnFocus } from "@/lib/return-focus";
import { toast } from "@/lib/toast";
import { tintStyle } from "@/lib/type-color";
import { cn } from "@/lib/utils";

const EXAMPLES = ["recommend.example.api", "recommend.example.ml", "recommend.example.web"] as const;
const EXPORT_TABS = [
  { value: "stack", path: "STACK.md", label: "STACK.md" },
  { value: "agents", path: "AGENTS.md", label: "AGENTS.md" },
  { value: "claude", path: "CLAUDE.md", label: "CLAUDE.md" },
  { value: "cursor", path: ".cursor/rules/stack.mdc", label: "Cursor" },
] as const;
const EXPORT_TARGETS = ["agents", "claude", "cursor"] as const;
const BLOCK_START = "<!-- basics:start -->";
const BLOCK_END = "<!-- basics:end -->";

/** The managed block of an agent file, without the user's surrounding text. */
function markedBlock(content: string): string {
  const start = content.indexOf(BLOCK_START);
  const end = start >= 0 ? content.indexOf(BLOCK_END, start + BLOCK_START.length) : -1;
  return start >= 0 && end >= 0 ? content.slice(start, end + BLOCK_END.length) : content;
}

function fileBasename(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}
const COLUMNS = "grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]";
/** Profiles keep their column width even when only one matches. */
const PROFILE_COLUMNS = "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]";
/** Only the first cards of a column stagger in; the rest appear with them. */
const STAGGER_LIMIT = 10;
const STAGGER_STEP = 0.02;
/** The Dock floats 16px off the bottom edge and is 54px tall; the selection pill sits 12px above it. */
const DOCK_BOTTOM = 16;
const DOCK_HEIGHT = DOCK_SPACE - 24;
const BAR_GAP = 12;

const enter = (index: number, reduce: boolean) => ({
  initial: index < STAGGER_LIMIT ? { opacity: 0, y: reduce ? 0 : 6 } : false,
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, ease: EASE_OUT, delay: Math.min(index, STAGGER_LIMIT) * STAGGER_STEP },
});

function TechChip({ id }: { id: string }) {
  return (
    <span
      className="inline-flex h-5 items-center rounded-full px-2 font-mono text-[10.5px] font-medium"
      style={tintStyle("var(--type-tech)")}
    >
      {id}
    </span>
  );
}

function PhraseList({ icon: Icon, label, className, phrases }: { icon: LucideIcon; label: string; className: string; phrases: string[] }) {
  if (phrases.length === 0) return null;
  return (
    <ul aria-label={label} className="flex flex-col gap-1">
      {phrases.map((phrase) => (
        <li key={phrase} className="flex items-start gap-1.5 text-[12px] leading-4 text-muted-foreground">
          <Icon className={cn("mt-px size-3 shrink-0", className)} aria-hidden="true" />
          <span>{phrase}</span>
        </li>
      ))}
    </ul>
  );
}

function ScoreBar({ value, max, reduce }: { value: number; max: number; reduce: boolean }) {
  const ratio = max > 0 ? Math.max(0, value) / max : 0;
  return (
    <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-muted">
      <motion.div
        className="h-full origin-left rounded-full bg-primary"
        initial={{ scaleX: reduce ? ratio : 0 }}
        animate={{ scaleX: ratio }}
        transition={reduce ? { duration: 0 } : { duration: 0.4, ease: EASE_OUT }}
      />
    </div>
  );
}

interface CandidateCardProps {
  candidate: Candidate;
  maxScore: number;
  selected: boolean;
  reduce: boolean;
  onToggle: () => void;
}

function ModeIndicator({ mode }: { mode: Recommendation["mode"] }) {
  const t = useT();
  return (
    <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
      {t(mode === "hybrid" ? "recommend.mode.hybrid" : "recommend.mode.keywords")}
    </span>
  );
}

function CandidateCard({ candidate, maxScore, selected, reduce, onToggle }: CandidateCardProps) {
  const t = useT();
  const avoid = candidate.matched_avoid_when.length > 0;
  const hybrid = candidate.hybrid;
  const breakdown = candidate.score_breakdown;
  const negated = [...new Set([...candidate.negated_use_when, ...candidate.negated_avoid_when])];
  const detail = [
    `${t("recommend.breakdown.keywords")} ${breakdown.keywords}`,
    breakdown.semantic === undefined ? "" : `${t("recommend.breakdown.semantic")} ${breakdown.semantic.toFixed(3)}`,
    `${t("recommend.breakdown.negation")} ${breakdown.negation}`,
    `${t("recommend.breakdown.language")} ${breakdown.language}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <Card
      interactive
      selected={selected}
      size="compact"
      className={cn(
        "gap-2.5 bg-card py-3 hover:border-foreground/20",
        avoid && "border-destructive/35 hover:border-destructive/50",
        (hybrid === undefined ? candidate.score <= 0 : hybrid <= 0) && "border-dashed bg-transparent",
      )}
    >
      <CardHeader className="gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative z-10 flex">
            <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={t("recommend.select", { id: candidate.id })} />
          </span>
          <Link
            to={`/notes/${encodeURIComponent(candidate.id)}`}
            aria-label={t("recommend.open", { id: candidate.id })}
            className={cn("min-w-0 truncate text-sm font-semibold tracking-tight outline-none", CARD_TARGET_CLASS)}
          >
            {candidate.id}
          </Link>
          <span className="truncate text-[11px] text-muted-foreground">{t(`option.${candidate.kind}` as TranslationKey)}</span>
          <span
            className="ml-auto font-mono text-[11px] text-muted-foreground tabular-nums"
            title={hybrid === undefined ? t("recommend.score") : detail}
          >
            {hybrid === undefined ? candidate.score : hybrid.toFixed(3)}
          </span>
        </div>
        <ScoreBar value={hybrid ?? candidate.score} max={hybrid === undefined ? maxScore : 1} reduce={reduce} />
      </CardHeader>
      {candidate.matched_use_when.length + candidate.matched_performs_best.length + candidate.matched_avoid_when.length > 0 && (
        <CardContent className="flex flex-col gap-1.5">
          <PhraseList icon={Check} label={t("recommend.useWhen")} className="text-type-practice" phrases={candidate.matched_use_when} />
          <PhraseList icon={Star} label={t("recommend.performsBest")} className="text-primary" phrases={candidate.matched_performs_best} />
          <PhraseList
            icon={AlertTriangle}
            label={t("recommend.avoidWhen")}
            className="text-destructive"
            phrases={candidate.matched_avoid_when}
          />
        </CardContent>
      )}
      {negated.length > 0 && (
        <CardContent>
          <PhraseList icon={Ban} label={t("recommend.negated")} className="text-destructive/70" phrases={negated} />
        </CardContent>
      )}
    </Card>
  );
}

interface ResultsProps {
  recommendation: Recommendation;
  layerTitle: (id: string) => string;
  selected: Set<string>;
  reduce: boolean;
  onToggle: (id: string) => void;
  onUseProfile: (stack: Record<string, string[]>) => void;
}

function RecommendationResults({ recommendation, layerTitle, selected, reduce, onToggle, onUseProfile }: ResultsProps) {
  const t = useT();
  const layers = Object.entries(recommendation.layers);
  const hasCandidates = layers.some(([, candidates]) => candidates.length > 0);
  const maxScore = Math.max(1, ...layers.flatMap(([, candidates]) => candidates.map((candidate) => candidate.score)));

  return (
    <div className="flex flex-col gap-6">
      {recommendation.profiles.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("recommend.profiles")}</h2>
          <div className={PROFILE_COLUMNS}>
            {recommendation.profiles.map((profile, index) => (
              <motion.div key={profile.id} {...enter(index, reduce)} className="min-w-0">
                <Card size="compact" className="h-full gap-3 bg-card py-3.5">
                  <CardHeader>
                    <div className="flex min-w-0 items-center gap-2">
                      <Link
                        to={`/notes/${encodeURIComponent(profile.id)}`}
                        className="min-w-0 truncate text-[15px] font-semibold tracking-tight hover:underline"
                      >
                        {profile.id}
                      </Link>
                      <span className="font-mono text-[11px] text-muted-foreground tabular-nums" title={t("recommend.score")}>
                        {profile.hybrid === undefined ? profile.score : profile.hybrid.toFixed(3)}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        pressScale={0.97}
                        className="ml-auto h-7 shrink-0"
                        onClick={() => onUseProfile(profile.stack)}
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
                            <TechChip key={tech} id={tech} />
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

      <section className="flex flex-col gap-2.5">
        <h2 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("recommend.perLayer")}</h2>
        {hasCandidates ? (
          <div className={cn(COLUMNS, "items-start gap-4")}>
            {layers.map(([layer, candidates]) => (
              <div key={layer} className="flex min-w-0 flex-col gap-2">
                <h3 className="px-1 text-sm font-semibold tracking-tight">{layerTitle(layer)}</h3>
                {candidates.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground">{t("recommend.noCandidates")}</p>
                ) : (
                  candidates.map((candidate, index) => (
                    <motion.div key={candidate.id} {...enter(index, reduce)}>
                      <CandidateCard
                        candidate={candidate}
                        maxScore={maxScore}
                        selected={selected.has(candidate.id)}
                        reduce={reduce}
                        onToggle={() => onToggle(candidate.id)}
                      />
                    </motion.div>
                  ))
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("recommend.noResults")}</p>
        )}
      </section>

      <p className="text-xs text-muted-foreground">{t(recommendation.mode === "hybrid" ? "recommend.note.hybrid" : "recommend.note")}</p>
    </div>
  );
}

function ResultsSkeleton({ layers, perLayer, label }: { layers: string[]; perLayer: number; label: string }) {
  const block = "rounded-2xl border bg-card motion-safe:animate-pulse";
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col gap-2.5">
        <div className="h-3 w-16 rounded-full bg-muted" />
        <div className={PROFILE_COLUMNS}>
          <div className={cn(block, "h-[122px]")} />
        </div>
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="h-3 w-16 rounded-full bg-muted" />
        <div className={cn(COLUMNS, "items-start gap-4")}>
          {layers.map((layer) => (
            <div key={layer} className="flex flex-col gap-2">
              <div className="mx-1 h-4 w-24 rounded-full bg-muted" />
              {Array.from({ length: perLayer }, (_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity.
                <div key={index} className={cn(block, "h-[92px]")} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function RecommendPage() {
  const t = useT();
  const reduce = useReducedMotion() ?? false;
  const layersQuery = useLayers();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [description, setDescription] = useState("");
  const [selectedLayers, setSelectedLayers] = useState<string[] | null>(null);
  const [perLayer, setPerLayer] = useState(3);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [files, setFiles] = useState<ExportFile[]>([]);
  const [stackIds, setStackIds] = useState<string[]>([]);
  const [exportTab, setExportTab] = useState<string>("stack");
  const [dialogOpen, setDialogOpen] = useState(false);
  const generateRef = useRef<HTMLButtonElement>(null);
  useReturnFocus(dialogOpen, generateRef);

  const layerIds = useMemo(() => (layersQuery.data ?? []).map((layer) => layer.id), [layersQuery.data]);
  const layerTitles = useMemo(
    () => new Map((layersQuery.data ?? []).map((layer) => [layer.id, layer.title || layer.id])),
    [layersQuery.data],
  );
  const activeLayers = selectedLayers ?? layerIds;

  const run = useMutation({
    mutationFn: recommend,
    onSuccess: () => setSelected(new Set()),
  });

  const exportFiles = useMutation({
    mutationFn: (ids: string[]) => exportStack(ids, [...EXPORT_TARGETS]),
    onSuccess: (data, ids) => {
      setFiles(data);
      setStackIds(ids);
      setExportTab("stack");
      setDialogOpen(true);
    },
    onError: () => toast.error(t("recommend.exportFailed")),
  });

  const toggleLayer = (id: string) => {
    setSelectedLayers(activeLayers.includes(id) ? activeLayers.filter((layer) => layer !== id) : [...activeLayers, id]);
  };

  const toggleTech = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const useProfile = (stack: Record<string, string[]>) => {
    setSelected(new Set(Object.values(stack).flat()));
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

  const activeTab = EXPORT_TABS.find((item) => item.value === exportTab) ?? EXPORT_TABS[0];
  const activeFile = files.find((file) => file.path === activeTab.path) ?? files[0];
  const blockOnly = activeTab.value === "agents" || activeTab.value === "claude";
  const content = blockOnly ? markedBlock(activeFile?.content ?? "") : (activeFile?.content ?? "");
  const filename = activeFile ? fileBasename(activeFile.path) : "STACK.md";
  const cli = `basics export --stack ${stackIds.join(",")} --targets ${EXPORT_TARGETS.join(",")}`;

  const download = () => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const layerTitle = (id: string) => layerTitles.get(id) ?? id;

  return (
    <div className="flex min-h-full flex-col">
      <div className={cn("mx-auto flex w-full max-w-[1200px] flex-col gap-4 px-5 pt-4", selected.size > 0 && "pb-16")}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight">{t("page.recommend.title")}</h1>
            {run.data ? <ModeIndicator mode={run.data.mode} /> : null}
          </div>
          {run.data?.mode === "keywords" ? (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{t("recommend.enableHybrid")}</span>
              <button
                type="button"
                aria-label={t("recommend.copyCli")}
                title={t("recommend.copyCli")}
                onClick={() => void copyText("basics embeddings enable")}
                className="grid size-5 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Copy className="size-3" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>

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
          className="bg-card"
          leadingAction={
            <kbd className="ml-2 rounded-full border border-border px-1.5 font-mono text-[10px] leading-4 text-muted-foreground">
              {t("recommend.shortcut")}
            </kbd>
          }
        />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
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
            <span className="text-xs text-muted-foreground" aria-hidden="true">
              {t("recommend.perLayer")}
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
                >
                  <AdaptiveStepperDecrement />
                  <AdaptiveStepperValue />
                  <AdaptiveStepperIncrement />
                </AdaptiveStepper>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2">
          {run.isPending ? (
            <ResultsSkeleton layers={activeLayers} perLayer={Math.min(perLayer, 4)} label={t("recommend.loading")} />
          ) : run.error ? (
            <ErrorState error={run.error} />
          ) : run.data ? (
            <RecommendationResults
              recommendation={run.data}
              layerTitle={layerTitle}
              selected={selected}
              reduce={reduce}
              onToggle={toggleTech}
              onUseProfile={useProfile}
            />
          ) : (
            <div className="flex flex-col gap-3 pt-2">
              <p className="max-w-2xl text-sm text-muted-foreground">{t("recommend.empty.description")}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="mr-1 text-xs text-muted-foreground">{t("recommend.examples")}</span>
                {EXAMPLES.map((key) => (
                  <motion.button
                    key={key}
                    type="button"
                    onClick={() => fillExample(t(key))}
                    whileTap={reduce ? undefined : { scale: 0.97 }}
                    className={cn(
                      "inline-flex h-7 max-w-full min-w-0 items-center rounded-full border border-border bg-card px-3 text-[12px] text-muted-foreground transition-colors",
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
      </div>

      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            role="region"
            aria-label={t("recommend.selectedBar")}
            initial={{ opacity: 0, y: reduce ? 0 : 8, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: reduce ? 0 : 8, x: "-50%", transition: { duration: 0.12, ease: EASE_OUT } }}
            transition={reduce ? { duration: 0.12 } : SPRING_PANEL}
            style={{ bottom: DOCK_BOTTOM + DOCK_HEIGHT + BAR_GAP }}
            className="fixed left-1/2 z-40 flex items-center gap-1 rounded-full border bg-background/70 py-1 pr-1 pl-1 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl"
          >
            <button
              type="button"
              aria-label={t("recommend.clear")}
              onClick={() => setSelected(new Set())}
              className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
            <span className="pr-2 text-[13px] font-medium tabular-nums">{t("recommend.selected", { count: selected.size })}</span>
            <span aria-hidden="true" className="text-muted-foreground/60">
              ·
            </span>
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
      </AnimatePresence>

      <CenterMorphModal open={dialogOpen} onOpenChange={setDialogOpen}>
        <CenterMorphModalContent
          ariaLabel={t("recommend.dialog.title")}
          closeButtonLabel={t("recommend.close")}
          className="max-h-[86dvh] max-w-[860px] overflow-y-auto p-5"
        >
          <h2 className="font-mono text-base font-semibold tracking-tight">{t("recommend.dialog.title")}</h2>
          <p className="mt-0.5 pr-10 text-[13px] text-muted-foreground">{t("recommend.dialog.description")}</p>

          <Tabs value={exportTab} onValueChange={setExportTab} variant="segment" className="mt-4">
            <TabsList aria-label={t("recommend.exportFiles")}>
              {EXPORT_TABS.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} className="px-3 py-1 text-xs">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <CodeBlock
            code={content}
            language="markdown"
            filename={filename}
            showStatus={false}
            copyable={false}
            showLineNumbers
            wrap
            maxHeight="54dvh"
            className="mt-2"
          />

          {blockOnly ? <p className="mt-2 text-[11px] text-muted-foreground">{t("recommend.mergeHint")}</p> : null}

          <div className="mt-3 flex min-w-0 items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-muted/70 px-2 py-1 font-mono text-[10.5px] text-muted-foreground">
              {cli}
            </code>
            <button
              type="button"
              aria-label={t("recommend.copyCli")}
              title={t("recommend.copyCli")}
              onClick={() => void copyText(cli)}
              className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Copy className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="secondary" size="sm" pressScale={0.97} onClick={() => void copyText(content)}>
              {blockOnly ? t("recommend.copyBlock") : t("recommend.copy")}
            </Button>
            {blockOnly ? null : (
              <Button size="sm" pressScale={0.97} onClick={download}>
                <Download className="size-3.5" aria-hidden="true" />
                {t("recommend.download")}
              </Button>
            )}
          </div>
        </CenterMorphModalContent>
      </CenterMorphModal>
    </div>
  );
}
