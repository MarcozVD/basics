import type { NoteData } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { DiffView } from "@/components/diff-view";
import { NoteForm } from "@/components/note-form/note-form";
import { ErrorState, Loading } from "@/components/state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { type TranslationKey, useI18n } from "@/i18n";
import { ApiRequestError, approveProposal, rejectProposal } from "@/lib/api";
import { useProposal } from "@/lib/queries";
import { formatRelativeTime } from "@/lib/relative-time";
import { toast } from "@/lib/toast";

function issuesToErrors(issues: unknown): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Array.isArray(issues)) return errors;
  for (const issue of issues) {
    if (!issue || typeof issue !== "object") continue;
    const { path, message } = issue as { path?: unknown; message?: unknown };
    if (!Array.isArray(path) || path.length === 0 || typeof message !== "string") continue;
    const key = path[0] === "data" && path.length > 1 ? String(path[1]) : String(path[0]);
    errors[key] = message;
  }
  return errors;
}

function ActionBadge({ action }: { action: "create" | "update" }) {
  const { t } = useI18n();
  return (
    <Badge
      variant={action === "create" ? "outline" : "secondary"}
      className={action === "create" ? "border-primary/50 text-primary" : undefined}
    >
      {t(action === "create" ? "proposal.action.create" : "proposal.action.update")}
    </Badge>
  );
}

function GoneState({ message, back }: { message: string; back: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium">{message}</p>
      <Button asChild variant="outline">
        <Link to="/inbox">{back}</Link>
      </Button>
    </div>
  );
}

export function ProposalPage() {
  const { id } = useParams();
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const proposalQuery = useProposal(id);
  const proposal = proposalQuery.data;

  const [gone, setGone] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editData, setEditData] = useState<NoteData | null>(null);
  const [editBody, setEditBody] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rejectOpen, setRejectOpen] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
  };

  const approve = useMutation({
    mutationFn: () => approveProposal(id ?? ""),
    onSuccess: (note) => {
      invalidate();
      toast.success(t("proposal.approved"));
      navigate(`/notes/${encodeURIComponent(note.id)}`);
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 404) {
        setGone(true);
        return;
      }
      toast.error(t("proposal.approveFailed"));
    },
  });

  const editApprove = useMutation({
    mutationFn: (input: { data: NoteData; body: string }) => approveProposal(id ?? "", input),
    onSuccess: (note) => {
      setEditOpen(false);
      invalidate();
      toast.success(t("proposal.approved"));
      navigate(`/notes/${encodeURIComponent(note.id)}`);
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 404) {
        setEditOpen(false);
        setGone(true);
        return;
      }
      if (error instanceof ApiRequestError && error.status === 400) {
        setErrors(issuesToErrors(error.body.issues));
        return;
      }
      toast.error(t("proposal.approveFailed"));
    },
  });

  const reject = useMutation({
    mutationFn: () => rejectProposal(id ?? ""),
    onSuccess: () => {
      invalidate();
      toast.success(t("proposal.rejected"));
      navigate("/inbox");
    },
    onError: (error) => {
      setRejectOpen(false);
      if (error instanceof ApiRequestError && error.status === 404) {
        setGone(true);
        return;
      }
      toast.error(t("proposal.rejectFailed"));
    },
  });

  const openEdit = useCallback(() => {
    if (!proposal) return;
    setEditData(proposal.data);
    setEditBody(proposal.body);
    setErrors({});
    setEditOpen(true);
  }, [proposal]);

  const busy = approve.isPending || editApprove.isPending || reject.isPending;
  const goneFromQuery = proposalQuery.error instanceof ApiRequestError && proposalQuery.error.status === 404;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)
      ) {
        return;
      }
      if (editOpen || rejectOpen || gone || busy || !proposal) return;
      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        approve.mutate();
      } else if (key === "e") {
        event.preventDefault();
        openEdit();
      } else if (key === "r") {
        event.preventDefault();
        setRejectOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [approve, editOpen, rejectOpen, gone, busy, proposal, openEdit]);

  if (gone || goneFromQuery) {
    return <GoneState message={t("proposal.gone")} back={t("proposal.backToInbox")} />;
  }

  if (proposalQuery.error) {
    return (
      <div className="p-6">
        <ErrorState error={proposalQuery.error} />
      </div>
    );
  }

  if (proposalQuery.isPending || !proposal) {
    return (
      <div className="p-6">
        <Loading />
      </div>
    );
  }

  const title = proposal.data.title ?? proposal.id;
  const typeLabel = t(`type.${proposal.data.type}` as TranslationKey);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 flex-col gap-2 border-b px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ActionBadge action={proposal.meta.action} />
          <h1 className="min-w-0 truncate text-base font-semibold">{title}</h1>
          <span className="font-mono text-[11px] text-muted-foreground">{proposal.id}</span>
          <Badge variant="outline">{typeLabel}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            {t("proposal.proposedBy")}: <span className="font-mono text-foreground">{proposal.meta.proposed_by}</span>
          </span>
          <span>
            {t("proposal.created")}:{" "}
            <time dateTime={proposal.meta.created} title={proposal.meta.created}>
              {formatRelativeTime(proposal.meta.created, language)}
            </time>
          </span>
        </div>
        <blockquote className="border-l-2 border-primary/40 pl-3 text-sm whitespace-pre-wrap text-muted-foreground italic">
          {proposal.meta.reason}
        </blockquote>
      </header>

      <div className="min-h-0 flex-1 p-4">
        <DiffView before={proposal.current?.text ?? null} after={proposal.proposedText} />
      </div>

      <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-background px-4 py-3">
        <Button variant="destructive" onClick={() => setRejectOpen(true)} disabled={busy}>
          <X aria-hidden="true" />
          {t("proposal.reject")}
        </Button>
        <Button variant="outline" onClick={openEdit} disabled={busy}>
          <Pencil aria-hidden="true" />
          {t("proposal.edit")}
        </Button>
        <Button onClick={() => approve.mutate()} disabled={busy}>
          <Check aria-hidden="true" />
          {t("proposal.approve")}
        </Button>
      </footer>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[900px]">
          <DialogHeader>
            <DialogTitle>{t("proposal.edit.title")}</DialogTitle>
            <DialogDescription className="font-mono">{proposal.id}</DialogDescription>
          </DialogHeader>

          {editData && (
            <div className="flex flex-col gap-3">
              <NoteForm type={editData.type} data={editData} errors={errors} onChange={setEditData} />
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="proposal-body" className="text-xs text-muted-foreground">
                  {t("editor.body")}
                </Label>
                <Textarea
                  id="proposal-body"
                  value={editBody}
                  aria-invalid={Boolean(errors.body)}
                  aria-describedby={errors.body ? "proposal-body-error" : undefined}
                  className="min-h-40 font-mono text-[13px]"
                  onChange={(event) => setEditBody(event.target.value)}
                />
                {errors.body && (
                  <p id="proposal-body-error" className="text-xs text-destructive">
                    {errors.body}
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              {t("proposal.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (editData) editApprove.mutate({ data: editData, body: editBody });
              }}
              disabled={editApprove.isPending || !editData}
            >
              {t("proposal.approve")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("proposal.reject.title")}</DialogTitle>
            <DialogDescription>{t("proposal.reject.description", { id: proposal.id })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              {t("proposal.cancel")}
            </Button>
            <Button variant="destructive" onClick={() => reject.mutate()} disabled={reject.isPending}>
              {t("proposal.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
