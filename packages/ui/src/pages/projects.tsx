import type { CheckStatus, ExportFile, LastCheck, NoteData, NoteDetail, NoteSummary } from "@marcozvd/basics-core";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { ArrowDownUp, Check, ChevronDown, Copy, ExternalLink, FileDown, FolderKanban, Search, SearchX, UserRound } from "lucide-react";
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
import { Link } from "react-router";
import { EXPORT_TARGETS, ExportModal } from "@/components/export-modal";
import { Button } from "@/components/motion/button/base";
import { Input } from "@/components/motion/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { PAGE_SECTIONS, Page, Reveal } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Loading } from "@/components/state";
import { type TranslationKey, useI18n } from "@/i18n";
import { exportStack, getNote, saveNote } from "@/lib/api";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/ease";
import { useIntentNavigate } from "@/lib/intent-navigate";
import { useIntro } from "@/lib/intro";
import { useDocumentTitle } from "@/lib/page-title";
import { useFirstPaint, useProgressiveCount } from "@/lib/progressive";
import { queryKeys, useNotes } from "@/lib/queries";
import { rememberRecentItem } from "@/lib/recent-notes";
import { formatCompactRelativeTime, formatFullDateTime, formatRelativeTime } from "@/lib/relative-time";
import { useReturnFocus } from "@/lib/return-focus";
import { useRouteSearchParams } from "@/lib/route-query";
import { toast } from "@/lib/toast";
import { tintStyle, typeColor } from "@/lib/type-color";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "basics:projects";
const WIDE_QUERY = "(min-width: 1280px)";
/** Search and sort only earn their space once the list is long enough to look through. */
const CHROME_MIN_PROJECTS = 8;

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
  /** Whether the collapsed "Done" group is expanded. */
  done: boolean;
};

const STATUS_FILTERS = ["all", "active", "paused", "done", "archived"] as const;
const SORTS = ["updated", "title"] as const;
const DEFAULT_PREFS: ProjectsPrefs = { status: "all", sort: "updated", done: false };
const STATUS_DOT: Record<ProjectStatus, string> = {
  active: "var(--type-practice)",
  paused: "var(--type-check)",
  done: "var(--type-check)",
  archived: "var(--type-layer)",
};
/** Finished projects read as a success state, like a passing check. */
const DONE_TONE = "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
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
      done: parsed?.done === true,
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

/** Primary create action shared by the list header and the empty state. */
function NewProjectButton() {
  const { t } = useI18n();
  return (
    <Button
      size="sm"
      pressScale={0.97}
      onClick={() => window.dispatchEvent(new CustomEvent("basics:new-note", { detail: { type: "project", from: "projects" } }))}
    >
      <FolderKanban className="size-3.5" aria-hidden="true" />
      {t("projects.create")}
    </Button>
  );
}

function StatusChip({ status, className }: { status: ProjectStatus; className?: string }) {
  const t = useI18n().t;
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium",
        status === "done" ? DONE_TONE : "border-border bg-muted/60 text-muted-foreground",
        className,
      )}
    >
      {status === "done" ? (
        <Check className="size-3" aria-hidden="true" />
      ) : (
        <span className="size-1.5 rounded-full" style={{ backgroundColor: STATUS_DOT[status] }} aria-hidden="true" />
      )}
      {t(`option.${status}` as TranslationKey)}
    </span>
  );
}

/** Row control: the current status as a chip that opens the four-state menu. */
function StatusMenu({ status, title, onChange }: { status: ProjectStatus; title: string; onChange: (status: ProjectStatus) => void }) {
  const t = useI18n().t;
  return (
    <Select className="shrink-0" value={status} onValueChange={(value) => onChange(value as ProjectStatus)}>
      <SelectTrigger
        aria-label={t("projects.changeStatus", { title })}
        className="h-5 w-auto gap-1 rounded-full border-0 bg-transparent px-0 py-0 text-[11px] shadow-none hover:bg-transparent"
      >
        <StatusChip status={status} />
      </SelectTrigger>
      <SelectContent className="w-40">
        {STATUS_FILTERS.filter((value): value is ProjectStatus => value !== "all").map((value) => (
          <SelectItem key={value} value={value}>
            {t(`option.${value}` as TranslationKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
          "inline-flex h-5 max-w-40 items-center gap-1 rounded-full px-2 text-[11px] transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
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
      className={cn("inline-flex h-5 max-w-36 items-center gap-1 rounded-full px-2 text-[11px]", className)}
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

function ProjectListRow({
  row,
  index,
  selected,
  reduce,
  noteById,
  onOpen,
  onChangeStatus,
}: {
  row: ProjectRow;
  index: number;
  selected: boolean;
  reduce: boolean;
  noteById: Map<string, NoteSummary>;
  onOpen: () => void;
  onChangeStatus: (status: ProjectStatus) => void;
}) {
  const { t, language } = useI18n();
  const failing = checkStats(row.project.last_checks)?.fail ?? 0;
  const stackIds = [...new Set(Object.values(row.project.stack).flat())];
  const missing = stackIds.filter((id) => noteById.get(id)?.type !== "tech").length;
  const report = [
    failing > 0 ? t(failing === 1 ? "projects.row.failingOne" : "projects.row.failing", { count: failing }) : null,
    missing > 0 ? t(missing === 1 ? "projects.row.missingTechOne" : "projects.row.missingTech", { count: missing }) : null,
  ].filter((line): line is string => Boolean(line));

  return (
    // A div, not a button: the row hosts the status menu and interactive
    // content cannot nest inside a native button. Keyboard Enter opens the row
    // from the page handler, which skips every real control inside it.
    <div
      role="option"
      id={`project-row-${index}`}
      data-project-row
      aria-selected={selected}
      tabIndex={-1}
      onClick={(event) => {
        const target = event.target instanceof HTMLElement ? event.target : null;
        // The status menu portals its panel to the body, where React still
        // bubbles the click through this row; only clicks on the row itself count.
        if (!target || !event.currentTarget.contains(target)) return;
        if (target.closest("[aria-haspopup]")) return;
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.key !== "Enter" || event.target !== event.currentTarget) return;
        event.preventDefault();
        onOpen();
      }}
      className="relative flex w-full min-w-0 cursor-default flex-col gap-1 border-b border-border/60 px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/35 focus-visible:bg-muted/40"
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
          className="shrink-0 font-mono text-[11px] text-muted-foreground"
        >
          {row.updated ? formatCompactRelativeTime(row.updated) : "-"}
        </time>
        <StatusMenu status={row.project.status} title={row.title} onChange={onChangeStatus} />
      </span>

      {report.length > 0 ? <p className="relative z-10 truncate text-[11px] text-muted-foreground">{report.join(" · ")}</p> : null}
    </div>
  );
}

function TechChip({ id, exists }: { id: string; exists: boolean }) {
  const t = useI18n().t;
  if (!exists) {
    return (
      <span
        title={t("projects.missingTech", { id })}
        className="inline-flex h-6 max-w-full items-center rounded-full border border-dashed border-destructive/45 bg-destructive/10 px-2 font-mono text-[11px] text-destructive-text"
      >
        <span className="truncate">{id}</span>
      </span>
    );
  }

  return (
    <Link
      to={`/notes/${encodeURIComponent(id)}`}
      title={t("projects.open", { id })}
      className="inline-flex h-6 max-w-full items-center rounded-full px-2 font-mono text-[11px] transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
              className="inline-flex h-6 items-center rounded-full border border-dashed border-destructive/45 bg-destructive/10 px-2 font-mono text-[11px] text-destructive-text"
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
            className="inline-flex h-6 max-w-full items-center rounded-full border border-border bg-muted/50 px-2 text-[11px] text-foreground transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
      className="hidden min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-muted/25 min-[1280px]:flex"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <header className="border-b border-border/70 p-5">
          <div className="flex flex-wrap items-start gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h2 className="min-w-0 text-lg font-semibold tracking-tight">{project.title}</h2>
                <StatusChip status={data.status} />
              </div>

              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
                {data.path ? (
                  <span className="flex min-w-0 max-w-full items-center gap-1 rounded-md bg-muted/55 py-0.5 pr-0.5 pl-2">
                    <code className="min-w-0 truncate font-mono text-[11px] text-muted-foreground" title={data.path}>
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
                <span className="font-mono text-[11px] text-muted-foreground">{checks.length}</span>
              </div>

              {checks.length > 0 ? (
                <div className="mt-2 overflow-x-auto rounded-xl border border-border/70">
                  <table className="w-full min-w-[560px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-border/70 bg-muted/35 text-[11px] tracking-wide text-muted-foreground uppercase">
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
                              {title !== id ? <span className="mt-0.5 block font-mono text-[11px] text-muted-foreground">{id}</span> : null}
                            </td>
                            <td className="px-3 py-2.5">
                              <span
                                className={cn(
                                  "inline-flex h-5 items-center rounded-full border px-2 text-[11px] font-medium",
                                  CHECK_TONE[check.status],
                                )}
                              >
                                {t(`editor.checkStatus.${check.status}` as TranslationKey)}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
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
                                  <summary className="cursor-pointer list-none text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                                    <span className="group-open:hidden">{t("projects.showOutput")}</span>
                                    <span className="hidden group-open:inline">{t("projects.hideOutput")}</span>
                                  </summary>
                                  <pre className="mt-1.5 max-h-40 max-w-[42rem] overflow-auto rounded-md bg-muted/55 p-2 font-mono text-[11px] leading-4 text-muted-foreground">
                                    {output}
                                  </pre>
                                </details>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">—</span>
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
                    <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">{command}</code>
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
  useDocumentTitle(t("page.projects.title"));
  const navigate = useIntentNavigate();
  const queryClient = useQueryClient();
  const wide = useWide();
  const reduce = useReducedMotion() ?? false;
  const notes = useNotes();
  const [prefs, setPrefs] = useState<ProjectsPrefs>(readPrefs);
  const intro = useIntro("projects", notes.isSuccess ? Boolean(notes.data?.length) : true);
  const [searchText, setSearchText] = useState("");
  const [selected, setSelected] = useState(0);
  const [searchParams, setSearchParams] = useRouteSearchParams();
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

  const counts = useMemo<Record<StatusFilter, number>>(
    () => ({
      all: rows.length,
      active: rows.filter((row) => row.project.status === "active").length,
      paused: rows.filter((row) => row.project.status === "paused").length,
      done: rows.filter((row) => row.project.status === "done").length,
      archived: rows.filter((row) => row.project.status === "archived").length,
    }),
    [rows],
  );
  /** A filter with nothing behind it would only produce an empty list. */
  const visibleFilters = useMemo(() => STATUS_FILTERS.filter((status) => status === "all" || counts[status] > 0), [counts]);
  const showChrome = rows.length >= CHROME_MIN_PROJECTS;

  // A status filter can empty out after a row changes status while it is selected.
  useEffect(() => {
    if (!notes.isSuccess) return;
    if (prefs.status === "all" || counts[prefs.status] > 0) return;
    setPrefs((value) => ({ ...value, status: "all" }));
  }, [notes.isSuccess, prefs.status, counts]);

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
      // Finished projects sink below the ones still in play, in both orders.
      const done = Number(a.project.status === "done") - Number(b.project.status === "done");
      if (done !== 0) return done;
      if (prefs.sort === "title") return a.title.localeCompare(b.title);
      const aTime = a.updated ? Date.parse(a.updated) : 0;
      const bTime = b.updated ? Date.parse(b.updated) : 0;
      if (aTime !== bTime) return bTime - aTime;
      return a.title.localeCompare(b.title);
    });
  }, [rows, prefs.status, prefs.sort, searchText]);

  // The default view keeps finished work in its own collapsible group; a
  // status filter or a search shows matches inline so nothing hides from it.
  const mainRows = useMemo(() => visible.flatMap((row, index) => (row.project.status === "done" ? [] : [{ row, index }])), [visible]);
  const doneRows = useMemo(() => visible.flatMap((row, index) => (row.project.status === "done" ? [{ row, index }] : [])), [visible]);
  const grouped = prefs.status === "all" && searchText.trim().length === 0 && doneRows.length > 0;
  const showDone = !grouped || prefs.done;
  // A long project list mounts the first screenful, then fills in idle slices.
  const firstPaint = useFirstPaint();
  const renderLimit = useProgressiveCount(mainRows.length + doneRows.length, `${prefs.status}|${prefs.sort}|${searchText}`, {
    active: firstPaint,
    initial: 8,
    chunk: 14,
  });
  const visibleLimit = firstPaint ? Math.max(renderLimit, selected + 1) : 0;
  const shownMain = mainRows.filter((entry) => entry.index < visibleLimit);
  const shownDone = doneRows.filter((entry) => entry.index < visibleLimit);
  /** Indices the keyboard can reach: hidden rows are skipped. */
  const reachable = useMemo(
    () => (showDone ? visible.map((_, index) => index) : mainRows.map((entry) => entry.index)),
    [showDone, visible, mainRows],
  );
  const activeId = (index: number) => `project-row-${index}`;
  const selectedRow = visible[selected];
  const listActiveId = selectedRow && (!grouped || selectedRow.project.status !== "done") ? activeId(selected) : undefined;
  const doneActiveId = grouped && prefs.done && selectedRow?.project.status === "done" ? activeId(selected) : undefined;

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

  /** Row whose id must stay selected while a status change reorders the list. */
  const pinnedId = useRef<string | null>(null);
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ProjectStatus }) => {
      const note = await getNote(id);
      if (note.data.type !== "project") throw new Error(`not a project: ${id}`);
      return saveNote(id, { data: { ...note.data, status }, body: note.body, expectedHash: note.hash });
    },
    // Move the row immediately; the vault event that follows refreshes the list.
    onMutate: ({ id, status }) => {
      const snapshot = queryClient.getQueriesData<NoteSummary[]>({ queryKey: ["notes"] });
      for (const [key, data] of snapshot) {
        if (!data) continue;
        queryClient.setQueryData<NoteSummary[]>(
          key,
          data.map((note) => (note.id === id && note.project ? { ...note, project: { ...note.project, status } } : note)),
        );
      }
      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      toast.error(t("projects.statusFailed"));
    },
    onSuccess: () => toast.success(t("projects.statusChanged")),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["notes"] }),
  });

  const changeStatus = (row: ProjectRow, status: ProjectStatus) => {
    if (row.project.status === status) return;
    pinnedId.current = row.id;
    setStatus.mutate({ id: row.id, status });
  };

  const move = (delta: number) =>
    setSelected((index) => {
      if (reachable.length === 0) return index;
      const at = reachable.indexOf(index);
      if (at < 0) return reachable[0];
      return reachable[Math.max(0, Math.min(at + delta, reachable.length - 1))];
    });

  const openNote = (row: ProjectRow | undefined) => {
    if (!row) return;
    navigate(`/notes/${encodeURIComponent(row.id)}`);
  };

  const openRow = (index: number) => {
    const row = visible[index];
    if (row) rememberRecentItem(row.id);
    if (wide) setSelected(index);
    else openNote(row);
  };

  useEffect(() => {
    setSelected((index) => Math.min(index, Math.max(visible.length - 1, 0)));
  }, [visible.length]);

  // A status change can reorder or hide the row the user just acted on.
  useEffect(() => {
    const id = pinnedId.current;
    if (!id) return;
    pinnedId.current = null;
    const index = visible.findIndex((row) => row.id === id);
    if (index >= 0) setSelected(index);
  }, [visible]);

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
      // A deep link to a finished project opens the group that holds it.
      if (grouped && visible[index].project.status === "done") {
        setPrefs((value) => (value.done ? value : { ...value, done: true }));
      }
      setSelected(index);
    } else if (notes.isSuccess) {
      pendingParam.current = null;
      setSelected(0);
    }
  }, [wide, pParam, visible, notes.isSuccess, grouped]);

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

      if (event.key === "/" && showChrome) {
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
        // Controls inside a row (the status menu) and the Done toggle own Enter.
        if (target?.closest("button, a, input, textarea, select, summary")) return;
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

  const renderRow = ({ row, index }: { row: ProjectRow; index: number }) => (
    <ProjectListRow
      key={row.id}
      row={row}
      index={index}
      selected={index === selected}
      reduce={reduce}
      noteById={noteById}
      onOpen={() => openRow(index)}
      onChangeStatus={(status) => changeStatus(row, status)}
    />
  );

  const projectEmpty = !notes.isPending && !notes.error && rows.length === 0;
  const filteredEmpty = visible.length === 0;

  if (projectEmpty) {
    return (
      <Page className={`min-h-0 ${PAGE_SECTIONS}`}>
        <Reveal index={0}>
          <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <h1 className="text-xl font-semibold tracking-tight">{t("page.projects.title")}</h1>
                <span className="text-xs text-muted-foreground">{t("projects.total", { count: 0 })}</span>
              </div>
              <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">{t("projects.intro")}</p>
            </div>
          </header>
        </Reveal>
        <Reveal index={1} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 items-center justify-center py-10">
            <div className="max-w-xl text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-muted/60 text-muted-foreground">
                <FolderKanban className="size-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-2xl font-semibold tracking-tight">{t("projects.empty.title")}</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {t("projects.empty.agentBefore")} <code className="font-mono text-[12px] text-foreground">record_project_outcome</code>,{" "}
                {t("projects.empty.exportBefore")} <code className="font-mono text-[12px] text-foreground">basics export</code>{" "}
                {t("projects.empty.exportAfter")}
              </p>
              <p className="mx-auto mt-3 max-w-md text-xs leading-5 text-muted-foreground">{t("projects.empty.hint")}</p>
              <div className="mt-5 flex flex-col items-center gap-2">
                <NewProjectButton />
                <p className="text-xs text-muted-foreground">{t("projects.empty.manual")}</p>
              </div>
            </div>
          </div>
        </Reveal>
      </Page>
    );
  }

  return (
    <Page className={`min-h-0 ${PAGE_SECTIONS}`}>
      <Reveal index={0}>
        <PageHeader
          title={t("page.projects.title")}
          meta={<span className="text-xs text-muted-foreground">{t("projects.total", { count: rows.length })}</span>}
          description={intro.showIntro ? t("projects.intro") : undefined}
          hint={intro.showIntro ? undefined : t("projects.intro")}
          onDismissDescription={intro.showIntro ? intro.dismiss : undefined}
          action={
            <div className="flex min-w-0 flex-wrap items-center gap-2 max-[640px]:w-full">
              <NewProjectButton />
              <Tabs
                value={prefs.status}
                onValueChange={(value) => {
                  setPrefs((currentPrefs) => ({ ...currentPrefs, status: value as StatusFilter }));
                  setSelected(0);
                }}
                variant="segment"
              >
                <TabsList aria-label={t("projects.statusFilter")}>
                  {visibleFilters.map((status) => (
                    <TabsTrigger key={status} value={status} className="gap-1.5 px-2.5 py-1 text-xs">
                      {statusLabel(status, t)}
                      <span className="font-mono text-[11px]">{counts[status]}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {showChrome ? (
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
              ) : null}

              {showChrome ? (
                <div className="flex h-9 items-center gap-1.5 rounded-xl border border-border bg-muted/50 px-2.5 text-xs text-muted-foreground">
                  <ArrowDownUp className="size-3.5" aria-hidden="true" />
                  <span className="sr-only">{t("projects.sort")}</span>
                  <Select
                    value={prefs.sort}
                    onValueChange={(value) => setPrefs((currentPrefs) => ({ ...currentPrefs, sort: value as Sort }))}
                  >
                    <SelectTrigger className="min-w-32 border-0 bg-transparent px-0 text-xs shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="updated">{t("projects.sort.updated")}</SelectItem>
                      <SelectItem value="title">{t("projects.sort.title")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
          }
        />
      </Reveal>

      <Reveal index={1} className="flex min-h-0 flex-col min-[1280px]:flex-1">
        <div className="grid min-h-0 gap-4 min-[1280px]:flex-1 min-[1280px]:grid-cols-[420px_minmax(0,1fr)]">
          <div className="flex min-h-0 min-w-0 flex-col">
            <div
              data-project-scroll
              // Inset the scroll box so the selected row's rounded highlight is not cut at the edges.
              className="min-h-0 flex-1 min-[1280px]:-m-1.5 min-[1280px]:overflow-y-auto min-[1280px]:overscroll-contain min-[1280px]:p-1.5"
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
              ) : !firstPaint ? null : (
                <div className="flex flex-col">
                  <div
                    role="listbox"
                    aria-label={t("projects.list")}
                    aria-activedescendant={listActiveId}
                    tabIndex={-1}
                    className="flex flex-col"
                  >
                    {shownMain.map(renderRow)}
                    {grouped ? null : shownDone.map(renderRow)}
                  </div>

                  {grouped ? (
                    <details
                      open={prefs.done}
                      onToggle={(event) => {
                        const next = event.currentTarget.open;
                        setPrefs((value) => (value.done === next ? value : { ...value, done: next }));
                      }}
                      className="group flex flex-col"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-1.5 border-b border-border/60 px-3 py-2 text-[11px] font-semibold tracking-[0.05em] text-muted-foreground uppercase transition-colors hover:bg-muted/35 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                        <ChevronDown
                          aria-hidden="true"
                          className={cn("size-3.5 -rotate-90 group-open:rotate-0", !reduce && "transition-transform duration-200")}
                        />
                        {t("projects.doneGroup", { count: doneRows.length })}
                      </summary>
                      <div
                        role="listbox"
                        aria-label={t("projects.doneList")}
                        aria-activedescendant={doneActiveId}
                        tabIndex={-1}
                        className="flex flex-col"
                      >
                        {shownDone.map(renderRow)}
                      </div>
                    </details>
                  ) : null}
                </div>
              )}
            </div>
          </div>

          {current && firstPaint ? (
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
              className="hidden min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-muted/25 min-[1280px]:flex"
            >
              <p className="m-auto max-w-sm px-6 text-center text-sm text-muted-foreground">{t("projects.filtered.title")}</p>
            </aside>
          )}
        </div>
      </Reveal>

      <ExportModal open={exportOpen} onOpenChange={setExportOpen} files={files} stackIds={exportStackIds} />
    </Page>
  );
}
