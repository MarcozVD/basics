import type { ApproveAllRequest, NoteData } from "@marcozvd/basics-core";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { ApiRequestError, approveAllProposals, approveProposal, rejectAllProposals, rejectProposal } from "@/lib/api";
import { issuesToErrors } from "@/lib/field-errors";
import { useIntentNavigate } from "@/lib/intent-navigate";
import { toast } from "@/lib/toast";

/**
 * The review queue behind the undo window.
 *
 * A decision is not sent the moment the key is pressed: it is held here, above the routes,
 * for six seconds. During that window the proposal is marked pending, the selection has already
 * moved on, and Z or the toast's Undo cancels the request. Navigating inside the app keeps the
 * timer; closing the tab kills it, which is why the toast says the note is not saved yet.
 */

const UNDO_MS = 6000;
const RESULT_MS = 4200;

type ReviewKind = "approve" | "reject" | "approve-all" | "reject-all";
export type BulkMode = "header" | "selection" | "pack";

export interface ReviewCallbacks {
  /** The request was cancelled from the toast or with Z. */
  onUndo?: () => void;
  /** The request failed; the proposal is still pending. */
  onError?: (error: unknown) => void;
  /** The request succeeded; result is the API response. */
  onSuccess?: (result: unknown) => void;
}

interface PendingReview {
  token: string;
  kind: ReviewKind;
  ids: string[];
  toastId: string;
  /** The text the toast shows while the action waits. */
  toastTitle: string;
  status: "armed" | "sending";
  request?: ApproveAllRequest;
  override?: { data: NoteData; body: string };
  mode?: BulkMode;
  callbacks?: ReviewCallbacks;
}

export interface ApproveInput {
  id: string;
  title: string;
  override?: { data: NoteData; body: string };
  callbacks?: ReviewCallbacks;
}

export interface RejectInput {
  id: string;
  title: string;
  callbacks?: ReviewCallbacks;
}

export interface BulkReviewInput {
  request: ApproveAllRequest;
  ids: string[];
  count: number;
  mode: BulkMode;
  callbacks?: ReviewCallbacks;
}

/** An edit draft that a failed queued approve must not throw away. */
export interface EditRecovery {
  id: string;
  data: NoteData;
  body: string;
  errors: Record<string, string>;
}

interface ReviewQueueValue {
  /** Proposals with a decision waiting or in flight; they cannot be acted on again. */
  pendingIds: ReadonlySet<string>;
  /** True while any review is waiting or in flight, so bulk actions stay mutually exclusive. */
  busy: boolean;
  /** The draft and field errors from a 400 on a queued edit, waiting for its editor. */
  editRecovery: EditRecovery | null;
  queueApprove: (input: ApproveInput) => void;
  queueReject: (input: RejectInput) => void;
  queueApproveAll: (input: BulkReviewInput) => void;
  queueRejectAll: (input: BulkReviewInput) => void;
  consumeEditRecovery: () => void;
  undoLatest: () => void;
}

const ReviewQueueContext = createContext<ReviewQueueValue | null>(null);

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return target.closest(".cm-editor") !== null;
}

export function ReviewQueueProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const navigate = useIntentNavigate();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [editRecovery, setEditRecovery] = useState<EditRecovery | null>(null);
  const pendingRef = useRef<PendingReview[]>([]);
  pendingRef.current = pending;
  const timers = useRef(new Map<string, number>());
  const seed = useRef(0);

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["proposal"] });
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  }, [queryClient]);

  const clearTimer = useCallback((token: string) => {
    const timer = timers.current.get(token);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(token);
    }
  }, []);

  const finish = useCallback(
    (action: PendingReview) => {
      clearTimer(action.token);
      pendingRef.current = pendingRef.current.filter((item) => item.token !== action.token);
      setPending((previous) => previous.filter((item) => item.token !== action.token));
    },
    [clearTimer],
  );

  const errorMessage = useCallback(
    (kind: ReviewKind, error: unknown): string => {
      if (error instanceof ApiRequestError) {
        if (error.status === 404) return t("proposal.gone");
        if (error.status === 409) return t("inbox.approveConflict");
        if (error.status === 400) return t("review.invalid");
      }
      if (kind === "approve") return t("proposal.approveFailed");
      if (kind === "reject") return t("proposal.rejectFailed");
      if (kind === "approve-all") return t("inbox.approveAllFailed");
      return t("inbox.rejectAllFailed");
    },
    [t],
  );

  const undo = useCallback(
    (token: string) => {
      const action = pendingRef.current.find((item) => item.token === token);
      if (action?.status !== "armed") return;
      finish(action);
      toast.dismiss(action.toastId);
      action.callbacks?.onUndo?.();
    },
    [finish],
  );

  const lastArmed = useCallback((): PendingReview | undefined => {
    for (let index = pendingRef.current.length - 1; index >= 0; index -= 1) {
      const action = pendingRef.current[index];
      if (action?.status === "armed") return action;
    }
    return undefined;
  }, []);

  const undoLatest = useCallback(() => {
    const action = lastArmed();
    if (action) undo(action.token);
  }, [lastArmed, undo]);

  const consumeEditRecovery = useCallback(() => setEditRecovery(null), []);

  const singleTitle = useCallback(
    (kind: "approve" | "reject", title: string) => t(kind === "approve" ? "review.approvedTitle" : "review.rejectedTitle", { title }),
    [t],
  );

  const bulkTitle = useCallback(
    (kind: "approve" | "reject", count: number) => {
      if (kind === "approve") return t(count === 1 ? "review.approvedOne" : "review.approvedMany", { count });
      return t(count === 1 ? "review.rejectedOne" : "review.rejectedMany", { count });
    },
    [t],
  );

  const send = useCallback(
    async (token: string) => {
      const action = pendingRef.current.find((item) => item.token === token);
      if (action?.status !== "armed") return;
      pendingRef.current = pendingRef.current.map((item) => (item.token === token ? { ...item, status: "sending" } : item));
      setPending((previous) => previous.map((item) => (item.token === token ? { ...item, status: "sending" } : item)));
      toast.update(action.toastId, { action: undefined, description: t("review.saving"), duration: 0 });

      try {
        if (action.kind === "approve") {
          const note = await approveProposal(action.ids[0], action.override);
          finish(action);
          invalidate();
          toast.update(action.toastId, {
            status: "success",
            description: undefined,
            dismissible: true,
            duration: RESULT_MS,
            action: {
              label: t("inbox.openNote"),
              onClick: () => navigate({ pathname: `/notes/${encodeURIComponent(note.id)}`, search: "" }),
            },
          });
          action.callbacks?.onSuccess?.(note);
          return;
        }

        if (action.kind === "reject") {
          await rejectProposal(action.ids[0]);
          finish(action);
          invalidate();
          toast.update(action.toastId, {
            status: "success",
            description: undefined,
            dismissible: true,
            duration: RESULT_MS,
          });
          action.callbacks?.onSuccess?.(undefined);
          return;
        }

        if (action.kind === "approve-all") {
          const data = await approveAllProposals(action.request ?? {});
          finish(action);
          invalidate();
          const message =
            action.mode === "pack" && data.failed.length === 0
              ? t("inbox.approveAllDone", { count: data.approved.length })
              : t("inbox.approveAllResult", { approved: data.approved.length, kept: data.failed.length });
          toast.update(action.toastId, {
            status: data.approved.length > 0 ? "success" : "error",
            title: message,
            description: undefined,
            dismissible: true,
            duration: RESULT_MS,
          });
          action.callbacks?.onSuccess?.(data);
          return;
        }

        const data = await rejectAllProposals(action.request ?? {});
        finish(action);
        invalidate();
        const message = t("inbox.rejectAllResult", { rejected: data.rejected.length, kept: data.failed.length });
        toast.update(action.toastId, {
          status: data.rejected.length > 0 ? "success" : "error",
          title: message,
          description: undefined,
          dismissible: true,
          duration: RESULT_MS,
        });
        action.callbacks?.onSuccess?.(data);
      } catch (error) {
        finish(action);
        toast.dismiss(action.toastId);
        const message = errorMessage(action.kind, error);
        const target = action.override ? `/inbox/${encodeURIComponent(action.ids[0])}` : undefined;
        const open = target
          ? {
              label: t("review.open"),
              onClick: () => navigate({ pathname: target, search: "" }),
            }
          : undefined;

        // A queued edit kept the user's draft. Never drop it on a validation failure: reopen
        // the editor with that draft and the server issues on their fields.
        if (action.override && error instanceof ApiRequestError && error.status === 400) {
          setEditRecovery({
            id: action.ids[0],
            data: action.override.data,
            body: action.override.body,
            errors: issuesToErrors(error.body.issues),
          });
          const path = window.location.pathname;
          if (path === "/inbox" || path.startsWith("/inbox/")) {
            if (target && path !== target) navigate({ pathname: target, search: "" }, { replace: true });
            return;
          }
          toast.error(message, open);
          return;
        }

        if (action.override && target) {
          // Other failures keep the proposal, so the draft is still recoverable from the toast.
          setEditRecovery({ id: action.ids[0], data: action.override.data, body: action.override.body, errors: {} });
          action.callbacks?.onError?.(error);
          if (error instanceof ApiRequestError && error.status === 404) invalidate();
          toast.error(message, open);
          return;
        }

        toast.error(message);
        if (error instanceof ApiRequestError && error.status === 404) invalidate();
        action.callbacks?.onError?.(error);
      }
    },
    [errorMessage, finish, invalidate, navigate, t],
  );

  const sendRef = useRef(send);
  sendRef.current = send;

  const push = useCallback(
    (input: Omit<PendingReview, "token" | "toastId" | "status">) => {
      const token = `review-${Date.now()}-${seed.current++}`;
      const toastId = toast.show({
        title: input.toastTitle,
        description: t("review.savingIn", { seconds: UNDO_MS / 1000 }),
        status: "info",
        action: { label: t("review.undo"), onClick: () => undo(token) },
        duration: 0,
        dismissible: false,
      });
      const timer = window.setTimeout(() => {
        timers.current.delete(token);
        void sendRef.current(token);
      }, UNDO_MS);
      timers.current.set(token, timer);
      pendingRef.current = [...pendingRef.current, { ...input, token, toastId, status: "armed" }];
      setPending((previous) => [...previous, { ...input, token, toastId, status: "armed" }]);
      return token;
    },
    [t, undo],
  );

  const queueApprove = useCallback(
    (input: ApproveInput) => {
      push({
        kind: "approve",
        ids: [input.id],
        toastTitle: singleTitle("approve", input.title),
        override: input.override,
        callbacks: input.callbacks,
      });
    },
    [push, singleTitle],
  );

  const queueReject = useCallback(
    (input: RejectInput) => {
      push({
        kind: "reject",
        ids: [input.id],
        toastTitle: singleTitle("reject", input.title),
        callbacks: input.callbacks,
      });
    },
    [push, singleTitle],
  );

  const queueApproveAll = useCallback(
    (input: BulkReviewInput) => {
      push({
        kind: "approve-all",
        ids: input.ids,
        toastTitle: bulkTitle("approve", input.count),
        request: input.request,
        mode: input.mode,
        callbacks: input.callbacks,
      });
    },
    [bulkTitle, push],
  );

  const queueRejectAll = useCallback(
    (input: BulkReviewInput) => {
      push({
        kind: "reject-all",
        ids: input.ids,
        toastTitle: bulkTitle("reject", input.count),
        request: input.request,
        mode: input.mode,
        callbacks: input.callbacks,
      });
    },
    [bulkTitle, push],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.key.toLowerCase() !== "z") return;
      const action = lastArmed();
      if (!action) return;
      event.preventDefault();
      undo(action.token);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lastArmed, undo]);

  useEffect(() => {
    const active = timers.current;
    return () => {
      for (const timer of active.values()) window.clearTimeout(timer);
      active.clear();
    };
  }, []);

  const pendingIds = useMemo(() => new Set(pending.flatMap((action) => action.ids)), [pending]);
  const value = useMemo<ReviewQueueValue>(
    () => ({
      pendingIds,
      busy: pending.length > 0,
      editRecovery,
      queueApprove,
      queueReject,
      queueApproveAll,
      queueRejectAll,
      consumeEditRecovery,
      undoLatest,
    }),
    [pendingIds, pending.length, editRecovery, queueApprove, queueApproveAll, queueReject, queueRejectAll, consumeEditRecovery, undoLatest],
  );

  return <ReviewQueueContext.Provider value={value}>{children}</ReviewQueueContext.Provider>;
}

export function useReviewQueue(): ReviewQueueValue {
  const value = useContext(ReviewQueueContext);
  if (!value) throw new Error("useReviewQueue must be used inside ReviewQueueProvider");
  return value;
}
