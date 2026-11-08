import type { NoteData } from "@marcozvd/basics-core";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { Page } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { ProposalDetail, ProposalEditModal } from "@/components/proposal-detail";
import { ErrorState, Loading } from "@/components/state";
import { useI18n } from "@/i18n";
import { ApiRequestError } from "@/lib/api";
import { useBackTarget } from "@/lib/app-history";
import { useIntentNavigate } from "@/lib/intent-navigate";
import { useInbox, useProposal } from "@/lib/queries";
import { useReturnFocus } from "@/lib/return-focus";
import { useReviewQueue } from "@/lib/review-queue";

function createdTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

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
  const navigate = useIntentNavigate();
  const proposalQuery = useProposal(id);
  const proposal = proposalQuery.data;
  const inbox = useInbox();
  const back = useBackTarget();
  const { pendingIds, queueApprove, queueReject, editRecovery, consumeEditRecovery } = useReviewQueue();

  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<{ data: NoteData; body: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [armed, setArmed] = useState(false);
  const armTimer = useRef<number | undefined>(undefined);
  const editButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => () => window.clearTimeout(armTimer.current), []);
  useReturnFocus(editOpen, editButtonRef);

  // A queued edit that failed validation comes back here, with the draft and field errors.
  useEffect(() => {
    if (!editRecovery || editRecovery.id !== id) return;
    setDraft({ data: editRecovery.data, body: editRecovery.body });
    setErrors(editRecovery.errors);
    setEditOpen(true);
    consumeEditRecovery();
  }, [consumeEditRecovery, editRecovery, id]);

  // Keep the same order as the Inbox list: newest first. After a decision the next
  // proposal opens at once, while the queue still holds the one just reviewed.
  const ordered = useMemo(
    () => [...(inbox.data ?? [])].sort((a, b) => createdTime(b.meta.created) - createdTime(a.meta.created)),
    [inbox.data],
  );
  const nextId = useMemo(() => {
    if (!id) return ordered[0]?.id;
    const index = ordered.findIndex((item) => item.id === id);
    const next =
      index < 0
        ? ordered.find((item) => item.id !== id)
        : ordered.slice(index + 1).find((item) => item.id !== id && !pendingIds.has(item.id));
    return next?.id === id ? undefined : next?.id;
  }, [id, ordered, pendingIds]);

  const afterPath = nextId ? `/inbox/${encodeURIComponent(nextId)}` : "/inbox";

  /** If the user is still on the route we moved to, undo or failure returns to this proposal. */
  const restoreRoute = () => {
    if (!id) return;
    if (window.location.pathname !== afterPath) return;
    navigate({ pathname: `/inbox/${encodeURIComponent(id)}`, search: "" }, { replace: true });
  };

  const queueCurrentApprove = (override?: { data: NoteData; body: string }) => {
    if (!id || !proposal) return;
    queueApprove({
      id,
      title: proposal.data.title ?? id,
      override,
      callbacks: { onUndo: restoreRoute, onError: restoreRoute },
    });
    setArmed(false);
    navigate(afterPath, { replace: true });
  };

  const queueCurrentReject = () => {
    if (!id || !proposal) return;
    queueReject({
      id,
      title: proposal.data.title ?? id,
      callbacks: { onUndo: restoreRoute, onError: restoreRoute },
    });
    setArmed(false);
    navigate(afterPath, { replace: true });
  };

  const openEdit = () => {
    if (!proposal) return;
    setDraft(null);
    setErrors({});
    setEditOpen(true);
  };

  const closeEdit = (open: boolean) => {
    setEditOpen(open);
    if (!open) {
      setDraft(null);
      setErrors({});
    }
  };

  const armReject = () => {
    if (armed) {
      window.clearTimeout(armTimer.current);
      setArmed(false);
      queueCurrentReject();
      return;
    }
    setArmed(true);
    armTimer.current = window.setTimeout(() => setArmed(false), 3000);
  };

  const busy = pendingIds.has(id ?? "");
  const goneFromQuery = proposalQuery.error instanceof ApiRequestError && proposalQuery.error.status === 404;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (editOpen || busy || !proposal) return;
      const key = event.key.toLowerCase();
      if (key === "a") {
        event.preventDefault();
        queueCurrentApprove();
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

  if (goneFromQuery) {
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
    <Page className="min-h-0 pb-28">
      <PageHeader back={back} />

      <ProposalDetail
        proposal={proposal}
        busy={busy}
        armed={armed}
        editButtonRef={editButtonRef}
        className="mt-3"
        onApprove={() => queueCurrentApprove()}
        onReject={armReject}
        onEdit={openEdit}
      />

      <ProposalEditModal
        proposal={proposal}
        open={editOpen}
        onOpenChange={closeEdit}
        errors={errors}
        pending={false}
        initial={draft ?? undefined}
        onSubmit={(data, body) => {
          queueCurrentApprove({ data, body });
          setEditOpen(false);
          setDraft(null);
          setErrors({});
        }}
      />
    </Page>
  );
}
