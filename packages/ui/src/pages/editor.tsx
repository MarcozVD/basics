import { markdown } from "@codemirror/lang-markdown";
import type { LastCheck, NoteData } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { Check, ChevronDown, MoreHorizontal, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router";
import { LocalGraph } from "@/components/graph/local-graph";
import { ActionSwapButton } from "@/components/motion/action-swap";
import { Alert, AlertAction, AlertContent, AlertDescription, AlertIcon, AlertTitle } from "@/components/motion/alert";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/motion/breadcrumb";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/motion/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/motion/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { Tooltip } from "@/components/motion/tooltip";
import { MarkdownPreview } from "@/components/note-form/markdown-preview";
import { NoteForm } from "@/components/note-form/note-form";
import { NotePreview, TypeChip, TypeDot } from "@/components/note-form/note-preview";
import { wikilinkExtensions } from "@/components/note-form/wikilink-editor";
import { ErrorState, Loading } from "@/components/state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type TranslationKey, useI18n } from "@/i18n";
import { ApiRequestError, deleteNote as deleteNoteApi, saveNote } from "@/lib/api";
import { SPRING_SWAP } from "@/lib/ease";
import { type CheckTone, lastCheckChips, tailLines } from "@/lib/last-checks";
import { queryKeys, useActivity, useNote, useNotes } from "@/lib/queries";
import { rememberRecentNote } from "@/lib/recent-notes";
import { formatRelativeTime } from "@/lib/relative-time";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

type ViewMode = "edit" | "preview" | "split";

const VIEW_KEY = "basics-editor-view";
const CONNECTIONS_KEY = "basics-editor-connections-open";
const LOCAL_GRAPH_KEY = "basics-editor-local-graph-open";

function issuesToErrors(issues: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Array.isArray(issues)) return errors;
  for (const issue of issues) {
    if (!issue || typeof issue !== "object") continue;
    const { path, message } = issue as { path?: unknown; message?: unknown };
    if (!Array.isArray(path) || typeof message !== "string") continue;
    errors[path.join(".")] = message;
  }
  return errors;
}

function readView(): ViewMode {
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    if (stored === "edit" || stored === "preview" || stored === "split") return stored;
  } catch {
    // Private mode: fall back to the breakpoint.
  }
  return typeof window !== "undefined" && window.innerWidth >= 1280 ? "split" : "edit";
}

function readConnections(): boolean {
  try {
    return localStorage.getItem(CONNECTIONS_KEY) === "1";
  } catch {
    return false;
  }
}

/** Open unless the user closed it once. */
function readLocalGraph(): boolean {
  try {
    return localStorage.getItem(LOCAL_GRAPH_KEY) !== "0";
  } catch {
    return true;
  }
}

function ConnectionRow({ id, broken }: { id: string; broken: boolean }) {
  const t = useI18n().t;
  const navigate = useNavigate();
  const notes = useNotes();
  const summary = notes.data?.find((note) => note.id === id);
  const title = summary?.title || id;

  const row = (
    <button
      type="button"
      title={broken ? t("editor.wikilinkMissing") : title}
      onClick={() => {
        if (broken) {
          window.dispatchEvent(new CustomEvent("basics:new-note", { detail: { id } }));
          return;
        }
        navigate(`/notes/${encodeURIComponent(id)}`);
      }}
      className={cn(
        "flex w-full min-w-0 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        broken && "text-destructive-text",
      )}
    >
      <TypeDot type={summary?.type} />
      <span className="min-w-0 flex-1 truncate text-xs">{title}</span>
      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{id}</span>
    </button>
  );

  return broken ? row : <NotePreview id={id}>{row}</NotePreview>;
}

function ConnectionList({ ids, empty, broken }: { ids: string[]; empty: string; broken: boolean }) {
  if (ids.length === 0) return <p className="px-1.5 text-xs text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col">
      {ids.map((id) => (
        <li key={id}>
          <ConnectionRow id={id} broken={broken} />
        </li>
      ))}
    </ul>
  );
}

const CHECK_TONE: Record<CheckTone, string> = {
  pass: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  fail: "border-destructive/25 bg-destructive/10 text-destructive-text",
  muted: "border-border bg-muted/60 text-muted-foreground",
};

/** Read-only chips for the last `basics check` run, under the project note meta line. */
function LastChecks({ checks }: { checks: Record<string, LastCheck> }) {
  const { t, language } = useI18n();
  const chips = lastCheckChips(checks);
  if (chips.length === 0) return null;

  return (
    <ul aria-label={t("editor.lastChecks")} className="mt-2 flex flex-wrap items-center gap-1.5">
      {chips.map(({ id, check, tone }) => {
        const output = tailLines(check.output_tail);
        const status = t(`editor.checkStatus.${check.status}` as TranslationKey);
        const at = formatRelativeTime(check.at, language);
        return (
          <li key={id} className="flex min-w-0 max-w-full shrink-0">
            <Tooltip
              side="top"
              align="start"
              arrow
              sideOffset={6}
              content={
                <div className="flex flex-col gap-1 font-mono text-[11px]">
                  {check.duration_ms !== undefined ? <span>{t("editor.checkDuration", { ms: check.duration_ms })}</span> : null}
                  {output.length ? (
                    <pre className="max-w-80 overflow-auto whitespace-pre-wrap text-[10.5px] leading-relaxed">{output.join("\n")}</pre>
                  ) : null}
                </div>
              }
            >
              <button
                type="button"
                aria-label={`${id}, ${status}, ${at}`}
                className={cn(
                  "inline-flex min-h-6 min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10.5px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                  CHECK_TONE[tone],
                )}
              >
                <span className="truncate">{id}</span>
                <span className="shrink-0 text-[10px] tracking-wide uppercase">{status}</span>
                <span className="shrink-0 text-muted-foreground">{at}</span>
              </button>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

export function EditorPage() {
  const { id } = useParams();
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion() ?? false;
  const noteQuery = useNote(id);
  const allNotes = useNotes();
  const noteActivity = useActivity({ noteId: id, limit: 100 });

  const [data, setData] = useState<NoteData | null>(null);
  const [body, setBody] = useState("");
  const [baseHash, setBaseHash] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [view, setView] = useState<ViewMode>(readView);
  const [connectionsOpen, setConnectionsOpen] = useState(readConnections);
  const [localGraphOpen, setLocalGraphOpen] = useState(readLocalGraph);
  const allowLeave = useRef(false);
  const savedTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(savedTimer.current), []);

  useEffect(() => {
    if (id) rememberRecentNote(id);
  }, [id]);

  useEffect(() => {
    const note = noteQuery.data;
    if (!note) return;
    if (baseHash === null) {
      setData(note.data);
      setBody(note.body);
      setBaseHash(note.hash);
      setDirty(false);
      return;
    }
    if (note.hash === baseHash) return;
    if (!dirty) {
      setData(note.data);
      setBody(note.body);
      setBaseHash(note.hash);
      setErrors({});
      setConflict(false);
    } else {
      setConflict(true);
    }
  }, [noteQuery.data, baseHash, dirty]);

  const markDirty = () => {
    setDirty(true);
    setSaved(false);
  };

  const save = useCallback(
    async (overwrite = false) => {
      if (!id || !data || baseHash === null || saving) return;
      setSaving(true);
      try {
        const result = await saveNote(id, { data, body, expectedHash: overwrite ? undefined : baseHash });
        setData(result.data);
        setBody(result.body);
        setBaseHash(result.hash);
        setDirty(false);
        setConflict(false);
        setErrors({});
        setSaved(true);
        window.clearTimeout(savedTimer.current);
        savedTimer.current = window.setTimeout(() => setSaved(false), 1600);
        queryClient.setQueryData(queryKeys.note(id), result);
        toast.success(t(overwrite ? "editor.overwritten" : "editor.saved"));
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 400 && error.body.error === "invalid") {
          setErrors(issuesToErrors(error.body.issues));
          toast.error(t("editor.saveFailed"));
        } else if (error instanceof ApiRequestError && error.status === 409) {
          setConflict(true);
        } else {
          toast.error(t("editor.saveFailed"));
        }
      } finally {
        setSaving(false);
      }
    },
    [id, data, body, baseHash, saving, queryClient, t],
  );

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => dirty && !allowLeave.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      if (blocker.state === "blocked") return;
      void save();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save, blocker.state]);

  const remove = useMutation({
    mutationFn: () => deleteNoteApi(id ?? "", baseHash ?? undefined),
    onSuccess: () => {
      allowLeave.current = true;
      queryClient.removeQueries({ queryKey: queryKeys.note(id ?? "") });
      toast.success(t("editor.deleted"));
      navigate("/explore");
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 409) setConflict(true);
      setConfirmDelete(false);
      toast.error(t("editor.deleteFailed"));
    },
  });

  const reload = async () => {
    const result = await noteQuery.refetch();
    if (result.data) {
      setData(result.data.data);
      setBody(result.data.body);
      setBaseHash(result.data.hash);
      setDirty(false);
      setConflict(false);
      setErrors({});
    } else if (result.error) {
      toast.error(t("state.error.title"));
    }
  };

  const readers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const event of noteActivity.data ?? []) {
      if (!seen.has(event.agent)) seen.set(event.agent, event.ts);
    }
    return [...seen.entries()];
  }, [noteActivity.data]);

  const typeById = useMemo(() => new Map((allNotes.data ?? []).map((note) => [note.id, note.type])), [allNotes.data]);

  const wikilinkOptions = useMemo(
    () =>
      (allNotes.data ?? []).map((note) => ({
        id: note.id,
        title: note.title || note.id,
        detail: `${note.id} · ${t(`type.${note.type}` as TranslationKey)}`,
      })),
    [allNotes.data, t],
  );

  const extensions = useMemo(() => [markdown(), EditorView.lineWrapping, ...wikilinkExtensions(wikilinkOptions)], [wikilinkOptions]);

  const setViewMode = (next: string) => {
    const mode = next as ViewMode;
    setView(mode);
    try {
      localStorage.setItem(VIEW_KEY, mode);
    } catch {
      // Private mode: only the current session remembers it.
    }
  };

  const setConnections = (next: boolean) => {
    setConnectionsOpen(next);
    try {
      localStorage.setItem(CONNECTIONS_KEY, next ? "1" : "0");
    } catch {
      // Private mode: only the current session remembers it.
    }
  };

  const setLocalGraph = (next: boolean) => {
    setLocalGraphOpen(next);
    try {
      localStorage.setItem(LOCAL_GRAPH_KEY, next ? "1" : "0");
    } catch {
      // Private mode: only the current session remembers it.
    }
  };

  if (noteQuery.error) {
    return (
      <div className="p-6">
        <ErrorState error={noteQuery.error} />
      </div>
    );
  }

  const note = noteQuery.data;
  if (noteQuery.isPending || !note || !data) {
    return (
      <div className="p-6">
        <Loading />
      </div>
    );
  }

  const title = data.title ?? note.id;
  const typeLabel = t(`type.${note.type}` as TranslationKey);
  const unresolved = note.links.filter((link) => allNotes.data !== undefined && !typeById.has(link));
  const editorPane = (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <CodeMirror
        value={body}
        minHeight={view === "split" ? "45vh" : "55vh"}
        theme="none"
        basicSetup={{ foldGutter: false, highlightActiveLine: false, autocompletion: false }}
        extensions={extensions}
        aria-label={t("editor.body")}
        onChange={(value) => {
          setBody(value);
          markDirty();
        }}
      />
    </div>
  );
  const previewPane = (
    <div className={cn("rounded-2xl border border-border bg-card/40 px-5 py-4", view === "split" && "min-h-[45vh]")}>
      <MarkdownPreview body={body} />
    </div>
  );

  return (
    <div className="mx-auto w-full px-5 pt-4 pb-32" style={{ maxWidth: view === "split" ? 1200 : 760 }}>
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border/60 bg-background py-2">
        <Breadcrumb className="min-w-0 flex-1">
          <BreadcrumbList maxItems={Number.POSITIVE_INFINITY} className="flex-nowrap gap-x-0.5 text-xs">
            <BreadcrumbItem key="explore">
              <BreadcrumbLink
                render={(props) => <a {...props} href="/explore" />}
                onClick={(event) => {
                  event.preventDefault();
                  navigate("/explore");
                }}
              >
                {t("nav.explore")}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem key="type">
              <BreadcrumbSeparator />
              <BreadcrumbLink
                render={(props) => <a {...props} href={`/explore?type=${note.type}`} />}
                onClick={(event) => {
                  event.preventDefault();
                  navigate(`/explore?type=${note.type}`);
                }}
              >
                {typeLabel}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbItem key="title">
              <BreadcrumbSeparator />
              <BreadcrumbPage className="max-w-[42vw] truncate">{title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <AnimatePresence initial={false}>
          {dirty ? (
            <motion.span
              key="dirty"
              role="img"
              aria-label={t("editor.unsaved")}
              title={t("editor.unsaved")}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={reduce ? { duration: 0 } : SPRING_SWAP}
              className="size-2 shrink-0 rounded-full bg-amber-500"
            />
          ) : null}
        </AnimatePresence>

        <ActionSwapButton
          items={[
            { id: "save", label: t("editor.save") },
            { id: "saved", label: <Check className="size-4" aria-hidden="true" />, ariaLabel: t("editor.saved") },
          ]}
          value={saved ? "saved" : "save"}
          cycle={false}
          variant="primary"
          size="sm"
          animation="blur"
          onClick={() => void save()}
          disabled={saving}
        />

        <Popover
          side="bottom"
          align="end"
          sideOffset={8}
          panelRadius={14}
          className="shrink-0"
          onOpenChange={(open) => !open && setConfirmDelete(false)}
        >
          <PopoverTrigger>
            <button
              type="button"
              aria-label={t("editor.more")}
              title={t("editor.more")}
              className="grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-1.5">
            {confirmDelete ? (
              <div className="flex flex-col gap-2 p-1.5">
                <p className="text-sm font-medium">{t("editor.delete.title")}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{t("editor.delete.description", { id: note.id })}</p>
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="rounded-full px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    {t("editor.cancel")}
                  </button>
                  <button
                    type="button"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate()}
                    className="rounded-full bg-destructive/15 px-3 py-1 text-xs font-medium text-destructive-text transition-colors hover:bg-destructive/25 disabled:opacity-50"
                  >
                    {t("editor.delete")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm text-destructive-text transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                {t("editor.delete")}
              </button>
            )}
          </PopoverContent>
        </Popover>
      </header>

      <Alert
        open={conflict}
        variant="warning"
        className="mt-3 rounded-xl border border-amber-500/30 px-3 py-2"
        contentClassName="items-center"
      >
        <AlertIcon />
        <AlertContent>
          <AlertTitle className="text-xs">{t("editor.conflict.title")}</AlertTitle>
          <AlertDescription className="text-[11px] text-muted-foreground">{t("editor.conflict.description")}</AlertDescription>
          <AlertAction className="gap-1.5 pt-1.5">
            <button
              type="button"
              onClick={() => void reload()}
              className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium transition-colors hover:bg-muted"
            >
              {t("editor.conflict.reload")}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void save(true)}
              className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {t("editor.conflict.overwrite")}
            </button>
          </AlertAction>
        </AlertContent>
      </Alert>

      <div className="mt-5">
        <input
          aria-label={t("field.title")}
          value={data.title ?? ""}
          placeholder={note.id}
          onChange={(event) => {
            setData({ ...data, title: event.target.value } as NoteData);
            markDirty();
          }}
          className="-mx-1.5 w-full rounded-lg bg-transparent px-1.5 text-[28px] leading-tight font-semibold tracking-[-0.02em] outline-none transition-colors placeholder:text-muted-foreground hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/30"
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <TypeChip type={note.type} />
          <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">
            {note.id} · {data.source}
            {data.updated ? ` · ${t("editor.updated")} ${data.updated}` : ""}
          </span>
          {readers.length > 0 ? (
            <Tooltip
              side="top"
              align="start"
              content={
                <span className="flex flex-col gap-0.5 font-mono text-[11px]">
                  {readers.map(([agent, ts]) => (
                    <span key={agent}>
                      {agent} · {formatRelativeTime(ts, language)}
                    </span>
                  ))}
                </span>
              }
            >
              <span className="shrink-0 cursor-default font-mono text-[11px] text-muted-foreground underline decoration-dotted underline-offset-2">
                {t(readers.length === 1 ? "editor.readByAgent" : "editor.readByAgents", { count: readers.length })}
              </span>
            </Tooltip>
          ) : null}
        </div>
        {data.type === "project" && data.last_checks ? <LastChecks checks={data.last_checks} /> : null}
      </div>

      <div className="mt-3">
        <NoteForm
          type={note.type}
          data={data}
          errors={errors}
          onChange={(next) => {
            setData(next);
            markDirty();
          }}
        />
      </div>

      <div className="mt-5 border-t border-border/70 pt-3">
        <Tabs value={view} onValueChange={setViewMode} variant="segment">
          <TabsList className="p-0.5">
            <TabsTrigger value="edit" className="px-3 py-1 text-xs">
              {t("editor.view.edit")}
            </TabsTrigger>
            <TabsTrigger value="preview" className="px-3 py-1 text-xs">
              {t("editor.view.preview")}
            </TabsTrigger>
            <TabsTrigger value="split" className="px-3 py-1 text-xs">
              {t("editor.view.split")}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div role="tabpanel" aria-label={t("editor.body")} className="mt-3">
          {view === "edit" ? editorPane : null}
          {view === "preview" ? previewPane : null}
          {view === "split" ? (
            <div className="grid gap-4 md:grid-cols-2">
              {editorPane}
              {previewPane}
            </div>
          ) : null}
        </div>
      </div>

      <section className="mt-7 border-t border-border/70 pt-2">
        <Collapsible open={connectionsOpen} onOpenChange={setConnections}>
          <CollapsibleTrigger className="min-h-8 w-full justify-start gap-1 rounded-lg px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase hover:bg-muted/40">
            <span aria-hidden="true" className="inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
              <ChevronDown className={cn("size-3.5 transition-transform duration-200", !connectionsOpen && "-rotate-90")} />
            </span>
            {t("editor.connections")}
            <span className="ml-2 font-mono text-[10px] font-normal tracking-normal normal-case">
              {t("editor.connectionsSummary", {
                links: note.links.length,
                backlinks: note.backlinks.length,
                unresolved: unresolved.length,
              })}
            </span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 grid gap-4 pb-2 sm:grid-cols-3">
              <div className="min-w-0">
                <h3 className="mb-1 px-1.5 text-[11px] font-medium text-muted-foreground">
                  {t("editor.links")} <span className="font-mono">{note.links.length}</span>
                </h3>
                <ConnectionList ids={note.links} empty={t("editor.noLinks")} broken={false} />
              </div>
              <div className="min-w-0">
                <h3 className="mb-1 px-1.5 text-[11px] font-medium text-muted-foreground">
                  {t("editor.backlinks")} <span className="font-mono">{note.backlinks.length}</span>
                </h3>
                <ConnectionList ids={note.backlinks} empty={t("editor.noBacklinks")} broken={false} />
              </div>
              <div className="min-w-0">
                <h3 className="mb-1 px-1.5 text-[11px] font-medium text-muted-foreground">
                  {t("editor.unresolved")} <span className="font-mono">{unresolved.length}</span>
                </h3>
                <ConnectionList ids={unresolved} empty={t("editor.noneUnresolved")} broken />
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <Collapsible open={localGraphOpen} onOpenChange={setLocalGraph}>
          <CollapsibleTrigger className="min-h-8 w-full justify-start gap-1 rounded-lg px-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase hover:bg-muted/40">
            <span aria-hidden="true" className="inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground">
              <ChevronDown className={cn("size-3.5 transition-transform duration-200", !localGraphOpen && "-rotate-90")} />
            </span>
            {t("editor.localGraph")}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 pb-2">{localGraphOpen && <LocalGraph id={note.id} />}</div>
          </CollapsibleContent>
        </Collapsible>
      </section>

      <Dialog
        open={blocker.state === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.state === "blocked") blocker.reset();
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("editor.unsavedTitle")}</DialogTitle>
            <DialogDescription>{t("editor.unsavedDescription")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                if (blocker.state === "blocked") blocker.reset();
              }}
              className="rounded-full border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              {t("editor.stay")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (blocker.state === "blocked") blocker.proceed();
              }}
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t("editor.leave")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
