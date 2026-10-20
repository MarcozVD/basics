import type { NoteData, NoteType } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { DiffView } from "@/components/diff-view";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Button } from "@/components/motion/button/base";
import { CenterMorphModal, CenterMorphModalContent } from "@/components/motion/center-morph-modal";
import { NoteForm } from "@/components/note-form/note-form";
import { ErrorState, Loading } from "@/components/state";
import { Textarea } from "@/components/ui/textarea";
import { type TranslationKey, useI18n } from "@/i18n";
import { agentColor, agentInitial } from "@/lib/agent-color";
import { ApiRequestError, approveProposal, rejectProposal } from "@/lib/api";
import { useProposal } from "@/lib/queries";
import { formatRelativeTime } from "@/lib/relative-time";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

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

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function ActionBadge({ action }: { action: "create" | "update" }) {
  const { t } = useI18n();
  return (
    <AnimatedBadge
      status={action === "create" ? "info" : "neutral"}
      size="sm"
      showIcon={false}
      className={cn(
        "border-transparent font-medium",
        action === "create" ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-muted/60 text-muted-foreground",
      )}
    >
      {t(action === "create" ? "proposal.action.create" : "proposal.action.update")}
    </AnimatedBadge>
  );
}

function TypeChip({ type }: { type: NoteType }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 text-[11px] text-muted-foreground">
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full ring-1 ring-black/10 dark:ring-white/20"
        style={{ backgroundColor: `var(--type-${type})` }}
      />
      {t(`type.${type}` as TranslationKey)}
    </span>
  );
}

function AgentAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-5 shrink-0 place-items-center rounded-md font-mono text-[10px] font-semibold text-[#111113]", className)}
      style={{ backgroundColor: agentColor(name) }}
    >
      {agentInitial(name)}
    </span>
  );
}

function GoneState({ message, back }: { message: string; back: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium">{message}</p>
      <Link
        to="/inbox"
        className="inline-flex h-8 items-center rounded-full border border-border px-3 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {back}
      </Link>
    </div>
  );
}

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="rounded-full border border-current/30 px-1.5 font-mono text-[10px] leading-4 text-current opacity-60">{children}</kbd>
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
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(armTimer.current), []);

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
      setArmed(false);
      if (error instanceof ApiRequestError && error.status === 404) {
        setGone(true);
        return;
      }
      toast.error(t("proposal.rejectFailed"));
    },
  });

  const openEdit = () => {
    if (!proposal) return;
    setEditData(proposal.data);
    setEditBody(proposal.body);
    setErrors({});
    setEditOpen(true);
  };

  const armReject = () => {
    if (armed) {
      window.clearTimeout(armTimer.current);
      setArmed(false);
      reject.mutate();
      return;
    }
    setArmed(true);
    armTimer.current = window.setTimeout(() => setArmed(false), 3000);
  };

  const busy = approve.isPending || editApprove.isPending || reject.isPending;
  const goneFromQuery = proposalQuery.error instanceof ApiRequestError && proposalQuery.error.status === 404;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (editOpen || gone || busy || !proposal) return;
      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        approve.mutate();
      } else if (key === "e") {
        event.preventDefault();
        openEdit();
      } else if (key === "r") {
        event.preventDefault();
        armReject();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (gone || goneFromQuery) {
    return <GoneState message={t("proposal.gone")} back={t("proposal.backToInbox")} />;
  }

  if (proposalQuery.error) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6">
        <ErrorState error={proposalQuery.error} />
      </div>
    );
  }

  if (proposalQuery.isPending || !proposal) {
    return (
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6">
        <Loading />
      </div>
    );
  }

  const title = proposal.data.title ?? proposal.id;
  const name = proposal.meta.proposed_by;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 pb-28 pt-4">
      <Link
        to="/inbox"
        className="inline-flex items-center gap-1 rounded-full text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {t("nav.inbox")}
      </Link>

      <header className="mt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ActionBadge action={proposal.meta.action} />
          <TypeChip type={proposal.data.type} />
          <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{title}</h1>
          <span className="font-mono text-[11px] text-muted-foreground">{proposal.id}</span>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <AgentAvatar name={name} />
            <span>
              {t("proposal.proposedBy")} <span className="font-mono text-foreground">{name}</span>
            </span>
          </span>
          <span>
            {t("proposal.created")}{" "}
            <time dateTime={proposal.meta.created} title={proposal.meta.created}>
              {formatRelativeTime(proposal.meta.created, language)}
            </time>
          </span>
        </div>

        <blockquote className="mt-3 max-w-3xl border-l-2 border-primary/40 pl-3 text-sm italic whitespace-pre-wrap text-muted-foreground">
          {proposal.meta.reason}
        </blockquote>
      </header>

      <div className="mt-4 h-[calc(100dvh-21rem)] min-h-[320px]">
        <DiffView before={proposal.current?.text ?? null} after={proposal.proposedText} file={proposal.id} />
      </div>

      <div
        role="toolbar"
        aria-label={t("proposal.actions")}
        className="fixed bottom-[82px] left-1/2 z-40 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-full border border-border bg-card/80 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl [scrollbar-width:none]"
      >
        <Button
          variant="ghost"
          size="sm"
          pressScale={0.97}
          disabled={busy}
          onClick={armReject}
          aria-label={armed ? t("proposal.rejectConfirm") : t("proposal.reject")}
          className="gap-1.5"
        >
          <X className="size-3.5" aria-hidden="true" />
          <span className={cn(armed && "text-destructive")}>{armed ? t("proposal.rejectConfirm") : t("proposal.reject")}</span>
          <Kbd>r</Kbd>
        </Button>
        <Button
          variant="secondary"
          size="sm"
          pressScale={0.97}
          disabled={busy}
          onClick={openEdit}
          aria-label={t("proposal.edit")}
          className="gap-1.5"
        >
          <Pencil className="size-3.5" aria-hidden="true" />
          {t("proposal.edit")}
          <Kbd>e</Kbd>
        </Button>
        <Button
          variant="primary"
          size="sm"
          pressScale={0.97}
          disabled={busy}
          onClick={() => approve.mutate()}
          aria-label={t("proposal.approve")}
          className="gap-1.5"
        >
          <Check className="size-3.5" aria-hidden="true" />
          {t("proposal.approve")}
          <Kbd>a</Kbd>
        </Button>
      </div>

      <CenterMorphModal open={editOpen} onOpenChange={setEditOpen}>
        <CenterMorphModalContent
          ariaLabel={t("proposal.edit.title")}
          closeButtonLabel={t("proposal.cancel")}
          className="max-h-[86dvh] max-w-[900px] overflow-y-auto p-6"
        >
          <h2 className="text-base font-semibold tracking-tight">{t("proposal.edit.title")}</h2>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{proposal.id}</p>

          {editData ? (
            <div className="mt-4 flex flex-col gap-3">
              <NoteForm type={editData.type} data={editData} errors={errors} onChange={setEditData} />
              <div className="flex flex-col gap-1.5">
                <label htmlFor="proposal-body" className="text-xs text-muted-foreground">
                  {t("editor.body")}
                </label>
                <Textarea
                  id="proposal-body"
                  value={editBody}
                  aria-invalid={Boolean(errors.body)}
                  aria-describedby={errors.body ? "proposal-body-error" : undefined}
                  className="min-h-40 rounded-xl font-mono text-[13px]"
                  onChange={(event) => setEditBody(event.target.value)}
                />
                {errors.body ? (
                  <p id="proposal-body-error" className="text-xs text-destructive">
                    {errors.body}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" pressScale={0.97} onClick={() => setEditOpen(false)}>
              {t("proposal.cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              pressScale={0.97}
              disabled={editApprove.isPending || !editData}
              onClick={() => {
                if (editData) editApprove.mutate({ data: editData, body: editBody });
              }}
            >
              {t("proposal.approve")}
            </Button>
          </div>
        </CenterMorphModalContent>
      </CenterMorphModal>
    </div>
  );
}
