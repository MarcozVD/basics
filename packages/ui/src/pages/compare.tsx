import type { ComparePlan, CompareReport, CompareState } from "@marcozvd/basics-core";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CompareSummary } from "@/components/compare-summary";
import { Input } from "@/components/motion/input";
import { PAGE_SECTIONS, Page } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useI18n } from "@/i18n";
import {
  cancelCompare,
  deleteCompareReport,
  getCompareHistory,
  getCompareReport,
  getCompareSamples,
  getCompareState,
  planCompare,
  startCompare,
} from "@/lib/api";
import { compareCopy } from "@/lib/compare-copy";
import { compareHistoryMeta } from "@/lib/compare-summary";
import { useIntro } from "@/lib/intro";
import { useDocumentTitle } from "@/lib/page-title";
import { useAgents } from "@/lib/queries";

const control =
  "min-h-9 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50";
/** Form fields match the selects and the task textarea: the shared pill input is for search boxes. */
const fieldClasses = { field: "h-9 rounded-xl" };
const historyKey = ["compare-history"];

export function ComparePage() {
  const { language } = useI18n();
  const c = compareCopy[language];
  useDocumentTitle(c.title);
  const client = useQueryClient();
  const agents = useAgents();
  const samples = useQuery({ queryKey: ["compare-samples"], queryFn: getCompareSamples });
  const history = useQuery({ queryKey: historyKey, queryFn: getCompareHistory });
  const current = useQuery({ queryKey: ["compare-state"], queryFn: getCompareState, refetchInterval: 3000 });
  const [state, setState] = useState<CompareState | null>(null);
  const [report, setReport] = useState<CompareReport | null>(null);
  const [task, setTask] = useState("");
  const [sample, setSample] = useState("");
  const [agentId, setAgentId] = useState("");
  const [model, setModel] = useState("");
  const [runs, setRuns] = useState(1);
  const [timeout, setTimeoutSeconds] = useState(600);
  const [plan, setPlan] = useState<ComparePlan | null>(null);
  const [step, setStep] = useState<"runs" | "checks">("runs");
  const [approveChecks, setApproveChecks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const detected = (agents.data?.agents ?? []).filter((agent) => agent.detected);
  const agent = detected.find((agent) => agent.id === agentId) ?? detected[0];
  const active = Boolean(state?.active);
  const recorded = Boolean(report?.recorded);
  const intro = useIntro("compare", Boolean(report));
  useEffect(() => {
    if (current.data !== undefined) setState(current.data);
    if (current.data?.report) setReport(current.data.report);
  }, [current.data]);
  useEffect(() => {
    const source = new EventSource("/api/compare/events");
    source.addEventListener("compare", (event) => {
      const next = JSON.parse((event as MessageEvent).data) as CompareState;
      setState(next);
      if (next.report) setReport(next.report);
      if (!next.active) void client.invalidateQueries({ queryKey: historyKey });
    });
    return () => source.close();
  }, [client]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError(false);
    try {
      await action();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  const number = (value: number | null | undefined) =>
    value === null || value === undefined ? c.unavailable : new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value);
  return (
    <Page className={PAGE_SECTIONS}>
      <PageHeader
        title={c.title}
        description={intro.showIntro ? c.intro : undefined}
        hint={c.intro}
        onDismissDescription={intro.showIntro ? intro.dismiss : undefined}
      />
      {error || history.isError || samples.isError || current.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {c.error}
        </p>
      ) : null}
      {recorded ? (
        <div role="note" className="rounded-xl border border-border p-4 text-sm">
          <strong>{c.recorded}</strong>
          <p className="mt-1 text-muted-foreground">{c.recordedHelp}</p>
        </div>
      ) : null}
      {report?.cancelled ? (
        <p role="status" className="text-sm text-muted-foreground">
          {c.phases.cancelled}
        </p>
      ) : null}
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void perform(async () => {
            if (!agent) return;
            const next = await planCompare({
              ...(sample ? { sample } : { task }),
              agent: agent.id,
              model: model || undefined,
              runs,
              timeoutMs: timeout * 1000,
            });
            setPlan(next);
            setStep("runs");
            setApproveChecks(false);
          });
        }}
      >
        <fieldset disabled={active || busy || recorded} className="grid min-w-0 gap-4">
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            {c.sample}
            <select className={control} value={sample} onChange={(event) => setSample(event.target.value)}>
              <option value="">{c.custom}</option>
              {samples.data?.map((item) => (
                <option key={item.sample} value={item.sample}>
                  {item.title[language] ?? item.title.en}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-xs text-muted-foreground">
            {c.task}
            <textarea
              className={`${control} min-h-28 resize-y text-foreground`}
              required={!sample}
              readOnly={Boolean(sample)}
              value={sample ? (samples.data?.find((item) => item.sample === sample)?.prompt[language] ?? "") : task}
              onChange={(event) => setTask(event.target.value)}
              placeholder={c.placeholder}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <label className="grid gap-1.5 text-xs text-muted-foreground">
              {c.agent}
              <select
                className={control}
                value={agent?.id ?? ""}
                onChange={(event) => {
                  setAgentId(event.target.value);
                  setModel("");
                }}
              >
                <option value="" disabled>
                  {c.agent}
                </option>
                {detected.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor="compare-model" className="grid gap-1.5 text-xs text-muted-foreground">
              {c.model}
              <Input
                id="compare-model"
                classNames={fieldClasses}
                list="compare-models"
                value={model}
                placeholder={c.defaultModel}
                onChange={setModel}
              />
              <datalist id="compare-models">
                {agent?.models.map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </label>
            <label htmlFor="compare-runs" className="grid gap-1.5 text-xs text-muted-foreground">
              {c.runs}
              <Input
                id="compare-runs"
                classNames={fieldClasses}
                type="number"
                min={1}
                max={10}
                required
                value={String(runs)}
                onChange={(value) => setRuns(Number(value))}
              />
            </label>
            <label htmlFor="compare-timeout" className="grid gap-1.5 text-xs text-muted-foreground">
              {c.timeout}
              <Input
                id="compare-timeout"
                classNames={fieldClasses}
                type="number"
                min={1}
                max={3600}
                required
                value={String(timeout)}
                onChange={(value) => setTimeoutSeconds(Number(value))}
              />
            </label>
          </div>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={!agent || active || busy || recorded}>
            {c.prepare}
          </Button>
          {!agent && !recorded ? <p className="text-xs text-muted-foreground">{c.noAgents}</p> : null}
          {recorded ? <p className="text-xs text-muted-foreground">{c.demoReadOnly}</p> : null}
        </div>
      </form>
      {state ? (
        <section aria-label={c.progress} className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/40 p-4">
          <p role="status" aria-live="polite" className="flex-1 text-sm">
            {c.phases[state.progress.phase]}
            {state.progress.condition ? ` · ${c[state.progress.condition]} · ${c.run} ${state.progress.run}` : ""}
            {state.progress.check
              ? ` · ${state.progress.check}${state.progress.status ? `: ${c.statuses[state.progress.status]}` : ""}`
              : ""}
          </p>
          {active ? (
            <Button
              size="sm"
              variant="outline"
              disabled={cancelling}
              onClick={() => {
                setCancelling(true);
                void perform(async () => {
                  try {
                    await cancelCompare(state.id);
                    setState(await getCompareState());
                  } finally {
                    setCancelling(false);
                  }
                });
              }}
            >
              {cancelling ? c.cancelling : c.cancel}
            </Button>
          ) : null}
          {state.error ? (
            <p role="alert" className="basis-full text-sm text-destructive">
              {c.error}
            </p>
          ) : null}
        </section>
      ) : null}
      {report ? <CompareSummary report={report} /> : null}
      {report ? (
        <section className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-2" aria-label={c.title} data-testid="compare-results">
          {(["without_basics", "with_basics"] as const).map((condition) => (
            <div key={condition} className="min-w-0 rounded-2xl border border-border p-4">
              <h2 className="text-base font-semibold">{c[condition]}</h2>
              {report.runs > 1 ? (
                <dl className="mt-3 grid grid-cols-1 gap-2 text-xs">
                  {(
                    ["wall_ms", "tokens_total", "checks_passed", "stack_match", "files_added", "files_changed", "files_deleted"] as const
                  ).map((metric, index) => {
                    const stat = report.summary[condition]?.[metric];
                    return (
                      <div key={metric}>
                        <dt className="text-muted-foreground">
                          {[c.wall, c.tokens, c.checks, c.stack, c.added, c.changed, c.deleted][index]}
                        </dt>
                        <dd className="font-mono">
                          {c.mean}: {number(stat?.mean)} · {c.spread}: {number(stat?.stddev)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              ) : null}
              {report.results
                .filter((result) => result.condition === condition)
                .map((result) => (
                  <article key={result.run} className="mt-4 min-w-0 border-t border-border pt-4 text-sm">
                    <h3 className="font-medium">
                      {c.run} {result.run}
                    </h3>
                    {!result.ok ? (
                      <p role="status" className="text-destructive">
                        {result.timed_out ? c.statuses.timeout : c.phases.error}
                      </p>
                    ) : null}
                    <dl className="mt-3 grid gap-2 text-xs">
                      {[
                        [c.wall, `${number(result.wall_ms / 1000)} s`],
                        [c.tokens, number(result.tokens?.total)],
                        [c.cacheRead, number(result.tokens?.cache_read)],
                        [c.cacheCreation, number(result.tokens?.cache_creation)],
                      ].map(([label, value]) => (
                        <div key={label} className="flex flex-wrap justify-between gap-x-3">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="font-mono tabular-nums">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <h4 className="mt-4 font-medium">{c.stack}</h4>
                    <ul className="mt-2 grid gap-2 text-xs">
                      {result.stack_comparison.map((layer) => (
                        <li key={layer.layer} className="break-words">
                          <strong>{layer.layer}</strong>: {layer.match ? c.match : c.noMatch}
                          <p className="mt-1 text-muted-foreground">
                            {c.expected}: {layer.expected.join(", ")} · {c.used}: {layer.used.join(", ") || c.noneDetected}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <h4 className="mt-4 font-medium">
                      {c.checks}: {result.checks_passed}/{result.checks.length}
                    </h4>
                    <ul className="mt-2 grid gap-2 text-xs">
                      {result.checks.map((check) => (
                        <li key={check.id}>
                          <span className="font-medium">
                            {check.id}: {c.statuses[check.status]}
                          </span>
                          {check.command ? <code className="mt-1 block break-all text-muted-foreground">{check.command}</code> : null}
                          {check.output_tail ? (
                            <details className="mt-1">
                              <summary className="rounded focus-visible:outline-2 focus-visible:outline-ring">{c.output}</summary>
                              <pre className="mt-1 whitespace-pre-wrap break-all">{check.output_tail}</pre>
                            </details>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <h4 className="mt-4 font-medium">{c.files}</h4>
                    <div className="mt-2 flex flex-col gap-2 text-xs">
                      {(["added", "changed", "deleted", "excluded"] as const).map((kind) => (
                        <details key={kind}>
                          <summary className="rounded focus-visible:outline-2 focus-visible:outline-ring">
                            {c[kind]}: {number(result.files?.[kind].length)}
                          </summary>
                          <ul className="mt-1 font-mono text-muted-foreground">
                            {result.files?.[kind].map((file) => (
                              <li key={file} className="break-all">
                                {file}
                              </li>
                            ))}
                          </ul>
                        </details>
                      ))}
                    </div>
                    <details className="mt-4">
                      <summary className="rounded text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring">
                        {c.output}
                      </summary>
                      <pre className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">
                        {result.output}
                      </pre>
                    </details>
                  </article>
                ))}
            </div>
          ))}
        </section>
      ) : null}
      <section aria-label={c.history}>
        <h2 className="text-sm font-semibold">{c.history}</h2>
        {history.isPending ? (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {c.loading}
          </p>
        ) : !history.data?.length ? (
          <p className="mt-3 text-sm text-muted-foreground">{c.empty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {history.data.map((item) => (
              <li key={item.id} className="flex min-w-0 flex-wrap items-center gap-2 py-3">
                <button
                  type="button"
                  aria-label={`${c.open}: ${item.task}`}
                  className="min-w-0 flex-1 rounded-lg text-left focus-visible:outline-2 focus-visible:outline-ring"
                  disabled={busy}
                  onClick={() => void perform(async () => setReport(await getCompareReport(item.id)))}
                >
                  <span className="line-clamp-2 text-sm">{item.task}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {compareHistoryMeta(item.agent, item.model, new Date(item.at).toLocaleString(language))}
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy || active || recorded}
                  aria-label={`${c.delete}: ${item.task}`}
                  onClick={() => setDeleting(item.id)}
                >
                  {c.delete}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <Dialog
        open={Boolean(plan)}
        onOpenChange={(open) => {
          if (!open && !busy) setPlan(null);
        }}
      >
        <DialogContent showCloseButton={false} className="compare-dialog max-h-[85dvh] overflow-y-auto motion-reduce:animate-none">
          <DialogTitle>{step === "runs" ? c.confirm : c.checkTitle}</DialogTitle>
          <DialogDescription>{step === "runs" ? c.quota.replace("{count}", String(plan?.run_count ?? 0)) : c.checkHelp}</DialogDescription>
          {step === "checks" ? (
            <>
              <ul className="grid gap-3">
                {plan?.checks.map((check) => (
                  <li key={check.id} className="text-xs">
                    <strong>{check.id}</strong>
                    <code className="mt-1 block break-all">{check.command}</code>
                  </li>
                ))}
              </ul>
              {plan?.checks.length ? (
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-primary"
                    checked={approveChecks}
                    onChange={(event) => setApproveChecks(event.target.checked)}
                  />
                  {c.approve}
                </label>
              ) : (
                <p className="text-xs text-muted-foreground">{c.noChecks}</p>
              )}
            </>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (step === "checks") setStep("runs");
                else setPlan(null);
              }}
            >
              {step === "checks" ? c.back : c.cancel}
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => {
                if (step === "runs") {
                  setStep("checks");
                  return;
                }
                void perform(async () => {
                  if (!plan) return;
                  await startCompare(plan.id, approveChecks);
                  setPlan(null);
                  setReport(null);
                  setState(await getCompareState());
                });
              }}
            >
              {step === "runs" ? c.next : c.start}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent showCloseButton={false} className="compare-dialog motion-reduce:animate-none">
          <DialogTitle>{c.deleteTitle}</DialogTitle>
          <DialogDescription>{c.deleteHelp}</DialogDescription>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              {c.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() =>
                void perform(async () => {
                  if (!deleting) return;
                  await deleteCompareReport(deleting);
                  if (report?.id === deleting) setReport(null);
                  setDeleting(null);
                  await client.invalidateQueries({ queryKey: historyKey });
                })
              }
            >
              {c.delete}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Page>
  );
}
