import type { Candidate, Recommendation } from "@marcozvd/basics-core";
import { useMutation } from "@tanstack/react-query";
import { cn } from "cn";
import { AlertTriangle, Check, Download, FileDown, Loader2, type LucideIcon, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Empty, ErrorState, Loading } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type TranslationKey, useT } from "@/i18n";
import { getContext, recommend } from "@/lib/api";
import { useLayers } from "@/lib/queries";

function PhraseList({ icon: Icon, className, phrases }: { icon: LucideIcon; className: string; phrases: string[] }) {
  if (phrases.length === 0) return null;
  return (
    <ul className="flex flex-col gap-0.5">
      {phrases.map((phrase) => (
        <li key={phrase} className="flex items-start gap-1 text-[11px] text-muted-foreground">
          <Icon className={cn("mt-0.5 size-3 shrink-0", className)} aria-hidden="true" />
          <span>{phrase}</span>
        </li>
      ))}
    </ul>
  );
}

function CandidateCard({ candidate, selected, onToggle }: { candidate: Candidate; selected: boolean; onToggle: () => void }) {
  const t = useT();
  const hasAvoid = candidate.matched_avoid_when.length > 0;
  return (
    <Card
      size="sm"
      className={cn("border-l-2 border-l-transparent", hasAvoid && "border-l-destructive", candidate.score <= 0 && "opacity-50")}
    >
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1 size-3.5 shrink-0 accent-primary"
            checked={selected}
            onChange={onToggle}
            aria-label={t("recommend.select", { id: candidate.id })}
          />
          <div className="min-w-0 flex-1">
            <Link to={`/notes/${encodeURIComponent(candidate.id)}`} className="text-sm font-medium hover:underline">
              {candidate.id}
            </Link>
            <p className="text-[11px] text-muted-foreground">
              {t(`option.${candidate.kind}` as TranslationKey)} · {t("recommend.score")}{" "}
              <span className="font-mono tabular-nums">{candidate.score}</span>
            </p>
          </div>
        </div>
        <PhraseList icon={Check} className="text-emerald-600 dark:text-emerald-400" phrases={candidate.matched_use_when} />
        <PhraseList icon={Star} className="text-sky-600 dark:text-sky-400" phrases={candidate.matched_performs_best} />
        <PhraseList icon={AlertTriangle} className="text-destructive" phrases={candidate.matched_avoid_when} />
      </CardContent>
    </Card>
  );
}

interface ResultsProps {
  recommendation: Recommendation;
  layerTitle: (id: string) => string;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onUseProfile: (stack: Record<string, string[]>) => void;
}

function RecommendationResults({ recommendation, layerTitle, selected, onToggle, onUseProfile }: ResultsProps) {
  const t = useT();
  const layers = Object.entries(recommendation.layers);
  const hasCandidates = layers.some(([, candidates]) => candidates.length > 0);

  return (
    <div className="flex flex-col gap-6">
      {recommendation.profiles.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">{t("recommend.profiles")}</h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {recommendation.profiles.map((profile) => (
              <Card key={profile.id} size="sm">
                <CardContent className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Link to={`/notes/${encodeURIComponent(profile.id)}`} className="min-w-0 truncate text-sm font-medium hover:underline">
                      {profile.id}
                    </Link>
                    <Badge variant="outline" className="font-mono text-[10px] tabular-nums" title={t("recommend.score")}>
                      {profile.score}
                    </Badge>
                    <Button variant="outline" size="xs" className="ml-auto" onClick={() => onUseProfile(profile.stack)}>
                      {t("recommend.useProfile")}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(profile.stack).map(([layer, techs]) => (
                      <Badge key={layer} variant="secondary" className="font-normal">
                        {layer}: {techs.join(", ")}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">{t("recommend.perLayer")}</h2>
        {hasCandidates ? (
          <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            {layers.map(([layer, candidates]) => (
              <div key={layer} className="flex flex-col gap-2">
                <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{layerTitle(layer)}</h3>
                {candidates.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t("recommend.noCandidates")}</p>
                ) : (
                  candidates.map((candidate) => (
                    <CandidateCard
                      key={candidate.id}
                      candidate={candidate}
                      selected={selected.has(candidate.id)}
                      onToggle={() => onToggle(candidate.id)}
                    />
                  ))
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t("recommend.noResults")}</p>
        )}
      </section>

      <p className="text-xs text-muted-foreground">{t("recommend.note")}</p>
    </div>
  );
}

export function RecommendPage() {
  const t = useT();
  const layersQuery = useLayers();
  const [description, setDescription] = useState("");
  const [selectedLayers, setSelectedLayers] = useState<string[] | null>(null);
  const [perLayer, setPerLayer] = useState(3);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [markdown, setMarkdown] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

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

  const context = useMutation({
    mutationFn: getContext,
    onSuccess: (data) => {
      setMarkdown(data.markdown);
      setDialogOpen(true);
    },
    onError: () => toast.error(t("recommend.contextFailed")),
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

  const canSubmit = description.trim().length > 0 && activeLayers.length > 0 && !run.isPending;
  const submit = () => {
    if (!canSubmit) return;
    run.mutate({ description: description.trim(), layers: activeLayers, perLayer });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success(t("recommend.copied"));
    } catch {
      toast.error(t("recommend.copyFailed"));
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([markdown], { type: "text/markdown" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "STACK.md";
    link.click();
    URL.revokeObjectURL(url);
  };

  const layerTitle = (id: string) => layerTitles.get(id) ?? id;

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 p-4">
        <h1 className="text-lg font-semibold">{t("page.recommend.title")}</h1>

        <form
          className="flex flex-col gap-4 rounded-xl border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="recommend-description" className="text-xs text-muted-foreground">
              {t("recommend.description")}
            </Label>
            <Textarea
              id="recommend-description"
              rows={3}
              value={description}
              placeholder={t("recommend.placeholder")}
              onChange={(event) => setDescription(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <fieldset className="flex min-w-0 flex-1 flex-col">
              <legend className="mb-1.5 text-xs text-muted-foreground">{t("recommend.layers")}</legend>
              <div className="flex flex-wrap gap-1.5">
                {(layersQuery.data ?? []).map((layer) => {
                  const active = activeLayers.includes(layer.id);
                  return (
                    <button
                      key={layer.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleLayer(layer.id)}
                      className={cn(
                        "h-7 rounded-full border px-2.5 text-xs font-medium transition-colors",
                        active ? "border-primary/30 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {layer.title || layer.id}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="recommend-per-layer" className="text-xs text-muted-foreground">
                {t("recommend.perLayer")}
              </Label>
              <Input
                id="recommend-per-layer"
                type="number"
                min={1}
                max={10}
                value={perLayer}
                className="w-20"
                onChange={(event) => {
                  const value = event.target.valueAsNumber;
                  if (Number.isFinite(value)) setPerLayer(Math.min(10, Math.max(1, Math.trunc(value))));
                }}
              />
            </div>

            <Button type="submit" disabled={!canSubmit}>
              {run.isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {t("recommend.submit")}
            </Button>
          </div>
        </form>

        {run.isPending ? (
          <Loading />
        ) : run.error ? (
          <ErrorState error={run.error} />
        ) : run.data ? (
          <RecommendationResults
            recommendation={run.data}
            layerTitle={layerTitle}
            selected={selected}
            onToggle={toggleTech}
            onUseProfile={useProfile}
          />
        ) : (
          <Empty title={t("recommend.empty.title")} description={t("recommend.empty.description")} />
        )}
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-2">
            <span className="text-sm font-medium">{t("recommend.selected", { count: selected.size })}</span>
            <Button className="ml-auto" disabled={context.isPending} onClick={() => context.mutate([...selected])}>
              <FileDown aria-hidden="true" />
              {t("recommend.generate")}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t("recommend.dialog.title")}</DialogTitle>
            <DialogDescription>{t("recommend.dialog.description")}</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
            {markdown}
          </pre>
          <DialogFooter>
            <Button variant="outline" onClick={() => void copy()}>
              {t("recommend.copy")}
            </Button>
            <Button onClick={download}>
              <Download aria-hidden="true" />
              {t("recommend.download")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
