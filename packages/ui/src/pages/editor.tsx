import { markdown } from "@codemirror/lang-markdown";
import type { NoteData } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import { cn } from "cn";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { NoteForm } from "@/components/note-form/note-form";
import { ErrorState, Loading } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type TranslationKey, useT } from "@/i18n";
import { ApiRequestError, deleteNote as deleteNoteApi, saveNote } from "@/lib/api";
import { queryKeys, useNote, useNotes } from "@/lib/queries";
import { useTheme } from "@/lib/theme";

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

export function EditorPage() {
  const { id } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resolvedTheme } = useTheme();
  const noteQuery = useNote(id);
  const allNotes = useNotes();

  const [data, setData] = useState<NoteData | null>(null);
  const [body, setBody] = useState("");
  const [baseHash, setBaseHash] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const allowLeave = useRef(false);

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
      if (deleteOpen || blocker.state === "blocked") return;
      void save();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save, deleteOpen, blocker.state]);

  const remove = useMutation({
    mutationFn: () => deleteNoteApi(id ?? "", baseHash ?? undefined),
    onSuccess: () => {
      allowLeave.current = true;
      queryClient.removeQueries({ queryKey: queryKeys.note(id ?? "") });
      toast.success(t("editor.deleted"));
      setDeleteOpen(false);
      navigate("/");
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 409) setConflict(true);
      setDeleteOpen(false);
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
  const known = new Set((allNotes.data ?? []).map((item) => item.id));

  const renderLinks = (ids: string[], empty: string) => {
    if (ids.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
    return (
      <ul className="flex flex-col gap-0.5">
        {ids.map((link) => {
          const broken = allNotes.data !== undefined && !known.has(link);
          return (
            <li key={link}>
              <button
                type="button"
                onClick={() => navigate(`/notes/${encodeURIComponent(link)}`)}
                title={broken ? t("editor.brokenLink", { id: link }) : link}
                className={cn(
                  "flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left font-mono text-[11px] hover:bg-muted",
                  broken && "text-amber-700 dark:text-amber-400",
                )}
              >
                <span className="truncate">{link}</span>
                {broken && <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />}
              </button>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold">{title}</h1>
            <Badge variant="outline">{typeLabel}</Badge>
            {dirty && (
              <span
                role="img"
                aria-label={t("editor.unsaved")}
                title={t("editor.unsaved")}
                className="size-2 shrink-0 rounded-full bg-amber-500"
              />
            )}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-3 text-[11px] text-muted-foreground">
            <span className="truncate font-mono">{note.id}</span>
            <span className="truncate">
              {t("editor.source")}: <span className="font-mono">{data.source}</span>
            </span>
            <span className="truncate">
              {t("editor.updated")}: {data.updated ?? "—"}
            </span>
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
          <Trash2 aria-hidden="true" />
          {t("editor.delete")}
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          {t("editor.save")}
        </Button>
      </header>

      {conflict && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs">
          <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <span className="font-medium">{t("editor.conflict.title")}</span>
          <span className="text-muted-foreground">{t("editor.conflict.description")}</span>
          <span className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void reload()}>
              {t("editor.conflict.reload")}
            </Button>
            <Button size="sm" onClick={() => void save(true)} disabled={saving}>
              {t("editor.conflict.overwrite")}
            </Button>
          </span>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <aside className="w-[360px] shrink-0 overflow-y-auto border-r p-3">
          <NoteForm
            type={note.type}
            data={data}
            errors={errors}
            onChange={(next) => {
              setData(next);
              setDirty(true);
            }}
          />
        </aside>

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <CodeMirror
            value={body}
            height="100%"
            theme={resolvedTheme}
            extensions={[markdown(), EditorView.lineWrapping]}
            basicSetup={{ foldGutter: false, highlightActiveLine: false }}
            className="h-full text-sm [&_.cm-editor]:h-full"
            aria-label={t("editor.body")}
            onChange={(value) => {
              setBody(value);
              setDirty(true);
            }}
          />
        </div>

        <aside className="flex w-[240px] shrink-0 flex-col gap-4 overflow-y-auto border-l p-3">
          <section>
            <h2 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("editor.links")}</h2>
            {renderLinks(note.links, t("editor.noLinks"))}
          </section>
          <section>
            <h2 className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{t("editor.backlinks")}</h2>
            {renderLinks(note.backlinks, t("editor.noBacklinks"))}
          </section>
        </aside>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("editor.delete.title")}</DialogTitle>
            <DialogDescription>{t("editor.delete.description", { id: note.id })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              {t("editor.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => remove.mutate()} disabled={remove.isPending}>
              {t("editor.delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <Button
              variant="outline"
              onClick={() => {
                if (blocker.state === "blocked") blocker.reset();
              }}
            >
              {t("editor.stay")}
            </Button>
            <Button
              onClick={() => {
                if (blocker.state === "blocked") blocker.proceed();
              }}
            >
              {t("editor.leave")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
