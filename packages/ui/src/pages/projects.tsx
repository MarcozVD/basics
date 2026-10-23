import type { CheckStatus, ExportFile, LastCheck, NoteData, NoteDetail, NoteSummary } from "@marcozvd/basics-core";
import { useMutation, useQueries } from "@tanstack/react-query";
import { ArrowDownUp, Check, Copy, ExternalLink, FileDown, FolderKanban, Search, SearchX, UserRound, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { EXPORT_TARGETS, ExportModal } from "@/components/export-modal";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Page } from "@/components/page";
import { ErrorState, Loading } from "@/components/state";
import { type TranslationKey, useI18n } from "@/i18n";
import { exportStack, getNote } from "@/lib/api";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/ease";
import { queryKeys, useNotes } from "@/lib/queries";
import { formatCompactRelativeTime, formatFullDateTime, formatRelativeTime } from "@/lib/relative-time";
import { useReturnFocus } from "@/lib/return-focus";
import { toast } from "@/lib/toast";
import { tintStyle, typeColor } from "@/lib/type-color";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "basics:projects";
const WIDE_QUERY = "(min-width: 1280px)";

type ProjectStatus = Extract<NoteData, { type: "project" }>["status"];
type StatusFilter = "all" | ProjectStatus;
type Sort = "updated" | "title";
type ProjectData = Extract<NoteData, { type: "project" }>;
type ProjectRow = {
  id: string;
  title: string;
  updated?: string;
  project: ProjectData;
};
type ProjectsPrefs = {
  status: StatusFilter;
  sort: Sort;
};

const STATUS_FILTERS = ["all", "active", "paused", "archived"] as const;
const SORTS = ["updated", "title"] as const;
const DEFAULT_PREFS: ProjectsPrefs = { status: "all", sort: "updated" };
const STATUS_DOT: Record<ProjectStatus, string> = {
  active: "var(--type-practice)",
  paused: "var(--type-check)",
  archived: "var(--type-layer)",
};
const CHECK_TONE: Record<CheckStatus, string> = {
  pass: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  fail: "border-destructive/25 bg-destructive/10 text-destructive-text",
  skip: "border-border bg-muted/60 text-muted-foreground",
  untrusted: "border-border bg-muted/60 text-muted-foreground",
};

function subscribeWide(callback: () => void) {
  const query = window.matchMedia(WIDE_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getWideSnapshot() {
  return window.matchMedia(WIDE_QUERY).matches;
}

function useWide() {
  return useSyncExternalStore(subscribeWide, getWideSnapshot, () => false);
}

function readPrefs(): ProjectsPrefs {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<ProjectsPrefs> | null;
    return {
      status:
        parsed && (STATUS_FILTERS as readonly string[]).includes(parsed.status ?? "")
          ? (parsed.status as StatusFilter)
          : DEFAULT_PREFS.status,
      sort: parsed && (SORTS as readonly string[]).includes(parsed.sort ?? "") ? (parsed.sort as Sort) : DEFAULT_PREFS.sort,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function writePrefs(prefs: ProjectsPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Storage can be unavailable (private mode, quota); the screen still works.
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable || target.closest(".cm-editor") !== null;
}

function middleTruncate(value: string, max = 42): string {
  if (value.length <= max) return value;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function checkStats(checks: Record<string, LastCheck> | undefined) {
  const list = Object.values(checks ?? {});
  if (list.length === 0) return null;
  const latest = list.reduce((next, check) => (Date.parse(check.at) > Date.parse(next) ? check.at : next), list[0].at);
  return {
    pass: list.filter((check) => check.status === "pass").length,
    fail: list.filter((check) => check.status === "fail").length,
    latest,
  };
}

function statusLabel(status: StatusFilter, t: (key: TranslationKey) => string) {
  return status === "all" ? t("type.all") : t(`option.${status}` as TranslationKey);
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <h3 className="text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">{children}</h3>;
}

function StatusChip({ status }: { status: ProjectStatus }) {
  const t = useI18n().t;
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-border bg-background/60 px-2 text-[10px] font-medium text-muted-foreground">
      <span className="size-1.5 rounded-full" style={{ backgroundColor: STATUS_DOT[status] }} aria-hidden="true" />
      {t(`option.${status}` as TranslationKey)}
    </span>
  );
}

function ProfileChip({ id, link, className }: { id: string; link?: boolean; className?: string }) {
  const t = useI18n().t;
  const style = tintStyle("var(--type-profile)");
  const content = (
    <>
      <UserRound className="size-2.5 shrink-0" aria-hidden="true" />
      <span className="truncate font-mono">{id}</span>
    </>
  );

  if (link) {
    return (
      <Link
        to={`/notes/${encodeURIComponent(id)}`}
        title={id}
        className={cn(
          "inline-flex h-5 max-w-40 items-center gap-1 rounded-full px-2 text-[10px] transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          className,
        )}
        style={style}
      >
        {content}
      </Link>
    );
  }

  return (
    <span
      title={`${t("projects.profile")} ${id}`}
      className={cn("inline-flex h-5 max-w-36 items-center gap-1 rounded-full px-2 text-[10px]", className)}
      style={style}
    >
      {content}
    </span>
  );
}

function CopyIconButton({ value, label }: { value: string; label: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(t("projects.copied"));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(t("projects.copyFailed"));
    }
  };

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => void copy()}
      className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
    </button>
  );
}

function StackSummary({ project, layerTitles }: { project: ProjectData; layerTitles: Map<string, string> }) {
  const t = useI18n().t;
  const entries = Object.entries(project.stack).filter(([, techs]) => techs.length > 0);
  if (entries.length === 0) return <span className="text-[10px] text-muted-foreground">{t("projects.noStack")}</span>;

  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      {entries.map(([layer, techs]) => {
        const name = layerTitles.get(layer) ?? layer;
        return (
          <span
            key={layer}
            title={t("projects.layerTechs", { layer: name, count: techs.length })}
            className="inline-flex min-w-0 items-center gap-1 font-mono text-[10px] text-muted-foreground"
          >
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: typeColor("tech") }} aria-hidden="true" />
            <span className="max-w-14 truncate">{name}</span>
            <span className="tabular-nums text-foreground/75">{techs.length}</span>
          </span>
        );
      })}
    </span>
  );
}

function ChecksSummary({ checks }: { checks: Record<string, LastCheck> | undefined }) {
  const { t, language } = useI18n();
  const stats = checkStats(checks);
  if (!stats) return <span className="text-[10px] text-muted-foreground">{t("projects.noChecks")}</span>;

  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <span className="sr-only">{t("projects.checksSummary", { pass: stats.pass, fail: stats.fail })}</span>
      <Check className="size-2.5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
      <span className="text-[10px] text-muted-foreground">{stats.pass}</span>
      <span className="text-[10px] text-border">/</span>
      <X className="size-2.5 text-destructive-text" aria-hidden="true" />
      <span className="text-[10px] text-muted-foreground">{stats.fail}</span>
      <span className="text-[10px] text-muted-foreground/70" title={formatFullDateTime(stats.latest, language)}>
        · {formatCompactRelativeTime(stats.latest)}
      </span>
    </span>
  );
}

function ProjectListRow({
  row,
  index,
  selected,
  reduce,
  layerTitles,
  onOpen,
  onEnter,
}: {
  row: ProjectRow;
  index: number;
  selected: boolean;
  reduce: boolean;
  layerTitles: Map<string, string>;
  onOpen: () => void;
  onEnter: () => void;
}) {
  const { t, language } = useI18n();
  const path = row.project.path;

  return (
    <button
      type="button"
      role="option"
      id={`project-row-${index}`}
      data-project-row
      aria-selected={selected}
      tabIndex={-1}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        event.stopPropagation();
        onEnter();
      }}
      className="relative flex w-full min-w-0 flex-col gap-1.5 border-b border-border/60 px-3 py-3 text-left outline-none transition-colors hover:bg-muted/35 focus-visible:bg-muted/40"
    >
      {selected ? (
        <motion.span
          aria-hidden="true"
          layoutId={reduce ? undefined : "project-selection"}
          transition={{ layout: SPRING_LAYOUT, duration: 0.18, ease: EASE_OUT }}
          className="absolute inset-0 rounded-xl bg-muted"
        />
      ) : null}

      <span className="relative z-10 flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{row.title}</span>
        <time
          dateTime={row.updated}
          title={row.updated ? formatFullDateTime(row.updated, language) : undefined}
          className="shrink-0 font-mono text-[10px] text-muted-foreground"
        >
          {row.updated ? formatCompactRelativeTime(row.updated) : "—"}
        </time>
        <StatusChip status={row.project.status} />
      </span>

      <span className="relative z-10 flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted-foreground" title={path ?? t("projects.noPath")}>
          {path ? middleTruncate(path) : t("projects.noPath")}
        </span>
        {row.project.profile ? <ProfileChip id={row.project.profile} /> : null}
      </span>

      <span className="relative z-10 flex min-w-0 items-center gap-2">
        <StackSummary project={row.project} layerTitles={layerTitles} />
        <span className="ml-auto shrink-0">
          <ChecksSummary checks={row.project.last_checks} />
        </span>
      </span>
    </button>
  );
}

function TechChip({ id, exists }: { id: string; exists: boolean }) {
  const t = useI18n().t;
  if (!exists) {
    return (
      <span
        title={t("projects.missingTech", { id })}
        className="inline-flex h-6 max-w-full items-center rounded-full border border-dashed border-destructive/45 bg-destructive/10 px-2 font-mono text-[10.5px] text-destructive-text"
      >
        <span className="truncate">{id}</span>
      </span>
    );
  }

  return (
    <Link
      to={`/notes/${encodeURIComponent(id)}`}
      title={t("projects.open", { id })}
      className="inline-flex h-6 max-w-full items-center rounded-full px-2 font-mono text-[10.5px] transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      style={tintStyle(typeColor("tech"))}
    >
      <span className="truncate">{id}</span>
    </Link>
  );
}

function LinkList({ ids, noteById, empty }: { ids: string[]; noteById: Map<string, NoteSummary>; empty: string }) {
  if (ids.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {ids.map((id) => {
        const note = noteById.get(id);
        const label = note?.title || id;
        if (!note) {
          return (
            <span
              key={id}
              title={id}
              className="inline-flex h-6 items-center rounded-full border border-dashed border-destructive/45 bg-destructive/10 px-2 font-mono text-[10.5px] text-destructive-text"
            >
              {label}
            </span>
          );
        }
        return (
          <Link
            key={id}
            to={`/notes/${encodeURIComponent(id)}`}
            title={id}
            className="inline-flex h-6 max-w-full items-center rounded-full border border-border bg-card/50 px-2 text-[10.5px] text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <span className="truncate">{label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function ProjectDetail({
  project,
  layerTitles,
  noteById,
  techDetails,
  linksPending,
  exportPending,
  exportButtonRef,
  onOpenNote,
  onExport,
}: {
  project: ProjectRow;
  layerTitles: Map<string, string>;
  noteById: Map<string, NoteSummary>;
  techDetails: NoteDetail[];
  linksPending: boolean;
  exportPending: boolean;
  exportButtonRef: RefObject<HTMLButtonElement | null>;
  onOpenNote: () => void;
  onExport: () => void;
}) {
  const { t, language } = useI18n();
  const data = project.project;
  const layers = Object.entries(data.stack).filter(([, techs]) => techs.length > 0);
  const checks = Object.entries(data.last_checks ?? {});
  const stackIds = [...new Set(Object.values(data.stack).flat())];
  const exportableIds = stackIds.filter((id) => noteById.get(id)?.type === "tech");
  const practices: string[] = [];
  const linkedChecks: string[] = [];
  for (const detail of techDetails) {
    if (detail.data.type !== "tech") continue;
    for (const id of detail.data.practices) if (!practices.includes(id)) practices.push(id);
    for (const id of detail.data.checks) if (!linkedChecks.includes(id)) linkedChecks.push(id);
  }
  const command = data.path ? `cd ${data.path} && basics check` : null;

  return (
    <aside
      aria-label={t("projects.detail")}
      className="hidden min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/20 min-[1280px]:flex"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <header className="border-b border-border/70 p-5">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="min-w-0 text-[22px] font-semibold tracking-tight">{project.title}</h2>
                <StatusChip status={data.status} />
              </div>

              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                {data.path ? (
                  <span className="flex min-w-0 max-w-full items-center gap-1 rounded-md bg-muted/55 py-0.5 pr-0.5 pl-2">
                    <code className="min-w-0 truncate font-mono text-[10.5px] text-muted-foreground" title={data.path}>
                      {data.path}
                    </code>
                    <CopyIconButton value={data.path} label={t("projects.copyPath")} />
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">{t("projects.noPath")}</span>
                )}
                {data.profile ? <ProfileChip id={data.profile} link /> : null}
                {project.updated ? (
                  <time
                    dateTime={project.updated}
                    title={formatFullDateTime(project.updated, language)}
                    className="text-[11px] text-muted-foreground"
                  >
                    {t("projects.updated", { time: formatRelativeTime(project.updated, language) })}
                  </time>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" pressScale={0.97} onClick={onOpenNote}>
                <ExternalLink className="size-3.5" aria-hidden="true" />
                {t("projects.openNote")}
              </Button>
              <Button
                ref={exportButtonRef}
                size="sm"
                pressScale={0.97}
                disabled={exportableIds.length === 0 || exportPending}
                title={exportableIds.length === 0 ? t("projects.exportUnavailable") : undefined}
                onClick={onExport}
              >
                <FileDown className="size-3.5" aria-hidden="true" />
                {t("projects.export")}
              </Button>
            </div>
          </div>
        </header>

        <div className="grid gap-7 p-5 min-[1600px]:grid-cols-[minmax(0,1.55fr)_minmax(300px,1fr)]">
          <div className="flex min-w-0 flex-col gap-7">
            <section className="min-w-0">
              <SectionLabel>{t("projects.stack")}</SectionLabel>
              {layers.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">{t("projects.noStack")}</p>
              ) : (
                <div className="mt-3 grid gap-x-5 gap-y-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
                  {layers.map(([layer, techs]) => (
                    <div key={layer} className="min-w-0">
                      <h4 className="mb-2 text-[11px] font-medium tracking-wide text-muted-foreground">
                        {layerTitles.get(layer) ?? layer}
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {techs.map((id) => (
                          <TechChip key={id} id={id} exists={noteById.get(id)?.type === "tech"} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <SectionLabel>{t("projects.lastChecks")}</SectionLabel>
                <span className="font-mono text-[10px] text-muted-foreground">{checks.length}</span>
              </div>

              {checks.length > 0 ? (
                <div className="mt-2 overflow-x-auto rounded-xl border border-border/70">
                  <table className="w-full min-w-[560px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border/70 bg-muted/35 text-[10px] tracking-wide text-muted-foreground uppercase">
                        <th scope="col" className="px-3 py-2 font-semibold">
                          {t("projects.check")}
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          {t("projects.status")}
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          {t("projects.duration")}
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          {t("projects.ran")}
                        </th>
                        <th scope="col" className="px-3 py-2 font-semibold">
                          {t("projects.output")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {checks.map(([id, check]) => {
                        const note = noteById.get(id);
                        const title = note?.title || id;
                        const output = check.output_tail?.trim();
                        return (
                          <tr key={id} className="border-b border-border/50 align-top last:border-0">
                            <td className="px-3 py-2.5">
                              <span className="block text-[12.5px] font-medium">{title}</span>
                              {title !== id ? (
                                <span className="mt-0.5 block font-mono text-[9.5px] text-muted-foreground">{id}</span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={cn(
                                  "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium",
                                  CHECK_TONE[check.status],
                                )}
                              >
                                {t(`editor.checkStatus.${check.status}` as TranslationKey)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[10.5px] text-muted-foreground">
                              {check.duration_ms === undefined ? "—" : `${check.duration_ms} ms`}
                            </td>
                            <td className="px-3 py-2.5 text-[11px] text-muted-foreground">
                              <time dateTime={check.at} title={formatFullDateTime(check.at, language)}>
                                {formatRelativeTime(check.at, language)}
                              </time>
                            </td>
                            <td className="px-3 py-2.5">
                              {output ? (
                                <details className="group min-w-40">
                                  <summary className="cursor-pointer list-none text-[10.5px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                                    <span className="group-open:hidden">{t("projects.showOutput")}</span>
                                    <span className="hidden group-open:inline">{t("projects.hideOutput")}</span>
                                  </summary>
                                  <pre className="mt-1.5 max-h-40 max-w-[42rem] overflow-auto rounded-md bg-muted/55 p-2 font-mono text-[10px] leading-4 text-muted-foreground">
                                    {output}
                                  </pre>
                                </details>
                              ) : (
                                <span className="text-[10.5px] text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="mt-2 rounded-xl border border-dashed border-border px-3 py-3">
                  <p className="text-sm font-medium">{t("projects.noChecks")}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t("projects.noChecksHint")}</p>
                </div>
              )}

              {command ? (
                <div className="mt-3 min-w-0">
                  <p className="text-[11px] text-muted-foreground">{t("projects.runChecks")}</p>
                  <div className="mt-1 flex min-w-0 items-center gap-1 rounded-md bg-muted/55 py-0.5 pr-0.5 pl-2">
                    <code className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-muted-foreground">{command}</code>
                    <CopyIconButton value={command} label={t("projects.copyCommand")} />
                  </div>
                </div>
              ) : null}
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-7">
            <section className="min-w-0">
              <SectionLabel>{t("projects.reason")}</SectionLabel>
              {data.reason ? (
                <p className="mt-2 max-w-[72ch] text-sm leading-6">{data.reason}</p>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{t("projects.noReason")}</p>
              )}

              <div className="mt-5">
                <SectionLabel>{t("projects.lessons")}</SectionLabel>
              </div>
              {data.lessons.length > 0 ? (
                <ul className="mt-2 max-w-[72ch] list-disc space-y-1.5 pl-4 text-sm leading-6 marker:text-muted-foreground/60">
                  {data.lessons.map((lesson) => (
                    <li key={lesson}>{lesson}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">{t("projects.noLessons")}</p>
              )}
            </section>

            <section className="min-w-0">
              <SectionLabel>{t("projects.fromStack")}</SectionLabel>
              <div className="mt-2 grid gap-4 min-[520px]:grid-cols-2 min-[1600px]:grid-cols-1">
                <div className="min-w-0">
                  <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground">{t("projects.linkedPractices")}</h4>
                  <div className="mt-1.5">
                    {linksPending ? (
                      <div className="flex gap-1.5" aria-hidden="true">
                        <span className="h-6 w-24 animate-pulse rounded-full bg-muted/70" />
                        <span className="h-6 w-20 animate-pulse rounded-full bg-muted/50" />
                      </div>
                    ) : (
                      <LinkList ids={practices} noteById={noteById} empty={t("projects.noneLinked")} />
                    )}
                  </div>
                </div>
                <div className="min-w-0">
                  <h4 className="text-[11px] font-medium tracking-wide text-muted-foreground">{t("projects.linkedChecks")}</h4>
                  <div className="mt-1.5">
                    {linksPending ? (
                      <div className="flex gap-1.5" aria-hidden="true">
                        <span className="h-6 w-24 animate-pulse rounded-full bg-muted/70" />
                        <span className="h-6 w-20 animate-pulse rounded-full bg-muted/50" />
                      </div>
                    ) : (
                      <LinkList ids={linkedChecks} noteById={noteById} empty={t("projects.noneLinked")} />
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function ProjectsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const wide = useWide();
  const reduce = useReducedMotion() ?? false;
  const notes = useNotes();
  const [prefs, setPrefs] = useState<ProjectsPrefs>(readPrefs);
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState(0);
  const [searchParams, setSearchParams] = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  const lastParam = useRef<string | null>(null);
  const pendingParam = useRef<string | null>(null);
  const exportButtonRef = useRef<HTMLButtonElement>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [files, setFiles] = useState<ExportFile[]>([]);
  const [exportStackIds, setExportStackIds] = useState<string[]>([]);
  const pParam = searchParams.get("p");

  useEffect(() => writePrefs(prefs), [prefs]);
  useReturnFocus(exportOpen, exportButtonRef);

  const rows = useMemo<ProjectRow[]>(
    () =>
      (notes.data ?? []).flatMap((note) =>
        note.type === "project" && note.project
          ? [{ id: note.id, title: note.title || note.id, updated: note.updated, project: note.project }]
          : [],
      ),
    [notes.data],
  );

  const noteById = useMemo(() => new Map((notes.data ?? []).map((note) => [note.id, note])), [notes.data]);
  const layerTitles = useMemo(
    () => new Map((notes.data ?? []).filter((note) => note.type === "layer").map((note) => [note.id, note.title || note.id])),
    [notes.data],
  );

  const counts = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((row) => row.project.status === "active").length,
      paused: rows.filter((row) => row.project.status === "paused").length,
      archived: rows.filter((row) => row.project.status === "archived").length,
    }),
    [rows],
  );

  const visible = useMemo(() => {
    const needle = searchText.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (prefs.status !== "all" && row.project.status !== prefs.status) return false;
      if (!needle) return true;
      return (
        row.title.toLowerCase().includes(needle) ||
        row.id.toLowerCase().includes(needle) ||
        (row.project.path ?? "").toLowerCase().includes(needle)
      );
    });

    return filtered.sort((a, b) => {
      if (prefs.sort === "title") return a.title.localeCompare(b.title);
      const aTime = a.updated ? Date.parse(a.updated) : 0;
      const bTime = b.updated ? Date.parse(b.updated) : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.title.localeCompare(b.title);
    });
  }, [rows, prefs.status, prefs.sort, searchText]);

  const current = wide ? visible[selected] : undefined;

  const techIds = useMemo(
    () => (current ? [...new Set(Object.values(current.project.stack).flat())].filter((id) => noteById.get(id)?.type === "tech") : []),
    [current, noteById],
  );
  const techQueries = useQueries({
    queries: techIds.map((id) => ({
      queryKey: queryKeys.note(id),
      queryFn: () => getNote(id),
      staleTime: 30_000,
    })),
  });
  const techDetails = techQueries.flatMap((query) => (query.data ? [query.data] : []));
  const linksPending = techQueries.some((query) => query.isPending);

  const exportFiles = useMutation({
    mutationFn: (ids: string[]) => exportStack(ids, EXPORT_TARGETS),
    onSuccess: (nextFiles, ids) => {
      setFiles(nextFiles);
      setExportStackIds(ids);
      setExportOpen(true);
    },
    onError: () => toast.error(t("recommend.exportFailed")),
  });

  const clampSelection = (index: number) => Math.max(0, Math.min(index, Math.max(visible.length - 1, 0)));
  const move = (delta: number) => setSelected((index) => clampSelection(index + delta));

  const openNote = (row: ProjectRow | undefined) => {
    if (!row) return;
    navigate(`/notes/${encodeURIComponent(row.id)}`);
  };

  const openRow = (index: number) => {
    if (wide) setSelected(index);
    else openNote(visible[index]);
  };

  useEffect(() => {
    setSelected((index) => Math.min(index, Math.max(visible.length - 1, 0)));
  }, [visible.length]);

  useEffect(() => {
    document.getElementById(`project-row-${selected}`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    if (!wide) {
      lastParam.current = null;
      pendingParam.current = null;
      return;
    }
    if (pParam !== lastParam.current) {
      lastParam.current = pParam;
      pendingParam.current = pParam;
    }
    if (!pendingParam.current) return;
    const index = visible.findIndex((row) => row.id === pendingParam.current);
    if (index >= 0) {
      pendingParam.current = null;
      setSelected(index);
    } else if (notes.isSuccess) {
      pendingParam.current = null;
      setSelected(0);
    }
  }, [wide, pParam, visible, notes.isSuccess]);

  useEffect(() => {
    if (!wide || notes.isPending) return;
    const next = visible[selected]?.id ?? null;
    if (next === pParam) return;
    lastParam.current = next;
    const params = new URLSearchParams(searchParams);
    if (next) params.set("p", next);
    else params.delete("p");
    setSearchParams(params, { replace: true });
  }, [wide, notes.isPending, pParam, visible, selected, searchParams, setSearchParams]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (visible.length === 0) return;

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        move(event.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (event.key === "Enter") {
        const target = event.target instanceof HTMLElement ? event.target : null;
        const row = target?.closest("[data-project-row]");
        if (target?.closest("button, a, input, textarea, select") && !row) return;
        event.preventDefault();
        openNote(visible[selected]);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setSearchText("");
      setSelected(0);
      return;
    }
    if (visible.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      move(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      openNote(visible[selected]);
    }
  };

  const handleExport = () => {
    if (!current) return;
    const ids = [...new Set(Object.values(current.project.stack).flat())].filter((id) => noteById.get(id)?.type === "tech");
    if (ids.length === 0) return;
    exportFiles.mutate(ids);
  };

  const clearFilters = () => {
    setPrefs((value) => ({ ...value, status: "all" }));
    setSearchText("");
    setSelected(0);
  };

  const projectEmpty = !notes.isPending && !notes.error && rows.length === 0;
  const filteredEmpty = visible.length === 0;

  if (projectEmpty) {
    return (
      <Page className="flex min-h-0 flex-col">
        <header className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{t("page.projects.title")}</h1>
          <span className="text-xs text-muted-foreground">{t("projects.total", { count: 0 })}</span>
        </header>
        <div className="flex min-h-[calc(100dvh-12rem)] items-center justify-center py-10">
          <div className="max-w-xl text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted/60 text-muted-foreground">
              <FolderKanban className="size-5" aria-hidden="true" />
            </span>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight">{t("projects.empty.title")}</h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {t("projects.empty.agentBefore")} <code className="font-mono text-[12px] text-foreground">record_project_outcome</code>.
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t("projects.empty.exportBefore")} <code className="font-mono text-[12px] text-foreground">basics export</code>{" "}
              {t("projects.empty.exportAfter")}
            </p>
            <p className="mx-auto mt-3 max-w-md text-xs leading-5 text-muted-foreground">{t("projects.empty.hint")}</p>
            <Button
              className="mt-5"
              size="sm"
              pressScale={0.97}
              onClick={() => window.dispatchEvent(new CustomEvent("basics:new-note", { detail: { type: "project" } }))}
            >
              <FolderKanban className="size-3.5" aria-hidden="true" />
              {t("projects.create")}
            </Button>
          </div>
        </div>
      </Page>
    );
  }

  return (
    <Page className="flex min-h-0 flex-col">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{t("page.projects.title")}</h1>
          <span className="text-xs text-muted-foreground">{t("projects.total", { count: rows.length })}</span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 max-[640px]:w-full">
          <Tabs
            value={prefs.status}
            onValueChange={(value) => {
              setPrefs((currentPrefs) => ({ ...currentPrefs, status: value as StatusFilter }));
              setSelected(0);
            }}
            variant="segment"
          >
            <TabsList aria-label={t("projects.statusFilter")}>
              {STATUS_FILTERS.map((status) => (
                <TabsTrigger key={status} value={status} className="gap-1.5 px-2.5 py-1 text-xs">
                  {statusLabel(status, t)}
                  <span className="font-mono text-[11px]">{counts[status]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <Input
            ref={searchRef}
            aria-label={t("projects.searchPlaceholder")}
            value={searchText}
            onChange={(value) => {
              setSearchText(value);
              setSelected(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder={t("projects.searchPlaceholder")}
            leftIcon={<Search className="size-3.5" aria-hidden="true" />}
            className="w-full min-[640px]:w-56"
            classNames={{ field: "h-9" }}
          />

          <div className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-background px-2.5 text-xs text-muted-foreground">
            <ArrowDownUp className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t("projects.sort")}</span>
            <Select value={prefs.sort} onValueChange={(value) => setPrefs((currentPrefs) => ({ ...currentPrefs, sort: value as Sort }))}>
              <SelectTrigger className="min-w-32 border-0 bg-transparent px-0 text-xs shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">{t("projects.sort.updated")}</SelectItem>
                <SelectItem value="title">{t("projects.sort.title")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <div className="mt-4 grid min-h-0 gap-4 min-[1280px]:h-[calc(100dvh-13rem)] min-[1280px]:grid-cols-[420px_minmax(0,1fr)]">
        <div className="flex min-h-0 min-w-0 flex-col">
          <div
            role="listbox"
            aria-label={t("projects.list")}
            aria-activedescendant={visible[selected] ? `project-row-${selected}` : undefined}
            tabIndex={-1}
            className="min-h-0 flex-1 min-[1280px]:overflow-y-auto min-[1280px]:overscroll-contain min-[1280px]:pr-1"
          >
            {notes.isPending ? (
              <div className="py-10">
                <Loading />
              </div>
            ) : notes.error ? (
              <div className="py-10">
                <ErrorState error={notes.error} />
              </div>
            ) : filteredEmpty ? (
              <div className="flex min-h-64 flex-col items-center justify-center gap-2 px-4 py-10 text-center min-[1280px]:min-h-full">
                <span className="grid size-10 place-items-center rounded-full bg-muted/60 text-muted-foreground">
                  <SearchX className="size-4" aria-hidden="true" />
                </span>
                <p className="text-sm font-medium">{t("projects.filtered.title")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t("projects.filtered.description")}</p>
                <Button variant="secondary" size="sm" pressScale={0.97} className="mt-1" onClick={clearFilters}>
                  {t("projects.clearFilters")}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col">
                {visible.map((row, index) => (
                  <ProjectListRow
                    key={row.id}
                    row={row}
                    index={index}
                    selected={index === selected}
                    reduce={reduce}
                    layerTitles={layerTitles}
                    onOpen={() => openRow(index)}
                    onEnter={() => openNote(row)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {current ? (
          <ProjectDetail
            project={current}
            layerTitles={layerTitles}
            noteById={noteById}
            techDetails={techDetails}
            linksPending={linksPending}
            exportPending={exportFiles.isPending}
            exportButtonRef={exportButtonRef}
            onOpenNote={() => openNote(current)}
            onExport={handleExport}
          />
        ) : (
          <aside
            aria-label={t("projects.detail")}
            className="hidden min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/20 min-[1280px]:flex"
          >
            <p className="m-auto max-w-sm px-6 text-center text-sm text-muted-foreground">{t("projects.filtered.title")}</p>
          </aside>
        )}
      </div>

      <ExportModal open={exportOpen} onOpenChange={setExportOpen} files={files} stackIds={exportStackIds} />
    </Page>
  );
}
