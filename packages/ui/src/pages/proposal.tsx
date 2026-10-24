import type { NoteData } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Page } from "@/components/page";
import { issuesToErrors, ProposalDetail, ProposalEditModal } from "@/components/proposal-detail";
import { ErrorState, Loading } from "@/components/state";
import { useI18n } from "@/i18n";
import { ApiRequestError, approveProposal, rejectProposal } from "@/lib/api";
import { useProposal } from "@/lib/queries";
import { useReturnFocus } from "@/lib/return-focus";
import { toast } from "@/lib/toast";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
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

export function ProposalPage() {
  const { id } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const proposalQuery = useProposal(id);
  const proposal = proposalQuery.data;

  const [gone, setGone] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<number | undefined>(undefined);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => window.clearTimeout(armTimer.current), []);
  useReturnFocus(editOpen, editButtonRef);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
  };

  const approve = useMutation({
    mutationFn: () => approveProposal(id ?? ""),
    onSuccess: (note) => {
      invalidate();
      toast.success(t("proposal.approved"));
      navigate({ pathname: `/notes/${encodeURIComponent(note.id)}`, search: "" });
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 404) {
        setGone(true);
        return;
      }
      if (error instanceof ApiRequestError && error.status === 409) {
        toast.error(t("inbox.approveConflict"));
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
      navigate({ pathname: `/notes/${encodeURIComponent(note.id)}`, search: "" });
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
      if (error instanceof ApiRequestError && error.status === 409) {
        toast.error(t("inbox.approveConflict"));
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
      navigate({ pathname: "/inbox", search: "" });
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
      <Page>
        <ErrorState error={proposalQuery.error} />
      </Page>
    );
  }

  if (proposalQuery.isPending || !proposal) {
    return (
      <Page>
        <Loading />
      </Page>
    );
  }

  return (
    <Page className="pb-28">
      <Link
        to="/inbox"
        className="inline-flex items-center gap-1 rounded-full text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        {t("nav.inbox")}
      </Link>

      <ProposalDetail
        proposal={proposal}
        busy={busy}
        armed={armed}
        editButtonRef={editButtonRef}
        className="mt-3"
        onApprove={() => approve.mutate()}
        onReject={armReject}
        onEdit={openEdit}
      />

      <ProposalEditModal
        proposal={proposal}
        open={editOpen}
        onOpenChange={setEditOpen}
        errors={errors}
        pending={editApprove.isPending}
        onSubmit={(data, body) => editApprove.mutate({ data, body })}
      />
    </Page>
  );
}
