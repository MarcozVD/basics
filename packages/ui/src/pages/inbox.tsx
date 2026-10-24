import type { ApproveAllRequest, NoteData } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Inbox as InboxIcon, Package } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useMatch, useNavigate, useSearchParams } from "react-router";
import { ApprovalCard } from "@/components/agents/approval-card";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Button } from "@/components/motion/button/base";
import { CenterMorphModal, CenterMorphModalContent } from "@/components/motion/center-morph-modal";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { PAGE_SECTIONS, Page } from "@/components/page";
import { issuesToErrors, ProposalDetail, ProposalEditModal } from "@/components/proposal-detail";
import { ErrorState, Loading } from "@/components/state";
import { type TranslationKey, useI18n } from "@/i18n";
import { agentColor, agentInitial } from "@/lib/agent-color";
import { ApiRequestError, approveAllProposals, approveProposal, rejectProposal } from "@/lib/api";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/ease";
import { groupPackProposals, packProposer } from "@/lib/packs";
import { useInbox, useProposal } from "@/lib/queries";
import { formatRelativeTime } from "@/lib/relative-time";
import { useReturnFocus } from "@/lib/return-focus";
import { toast } from "@/lib/toast";

type Filter = "all" | "create" | "update";
type ApproveAllMode = "pack" | "header";
type ApproveAllVariables = { request: ApproveAllRequest; mode: ApproveAllMode };

const README_PROPOSE = "https://marcozvd.github.io/basics/guide/mcp-clients.html";
const WIDE_QUERY = "(min-width: 1280px)";

function createdTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/** Master-detail starts at 1280px; below it the list opens the full proposal page. */
function useWideInbox(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(WIDE_QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

export function InboxPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // This page can stay mounted for one render after the router enters `/inbox/:id`.
  // While that detail route owns the URL, the list must not write its own `?p=`.
  const detailRoute = useMatch("/inbox/:id") !== null;
  const wide = useWideInbox();
  const reduce = useReducedMotion() ?? false;
  const queryClient = useQueryClient();
  const inbox = useInbox();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  const armTimer = useRef<number | undefined>(undefined);
  const [armedPack, setArmedPack] = useState<string | null>(null);
  const packTimer = useRef<number | undefined>(undefined);
  const [editOpen, setEditOpen] = useState(false);
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const approveAllButtonRef = useRef<HTMLButtonElement>(null);
  const lastParam = useRef<string | null>(null);
  const pendingParam = useRef<string | null>(null);
  const pParam = searchParams.get("p");
  const packFilter = searchParams.get("pack");

  useReturnFocus(editOpen, editButtonRef);
  useReturnFocus(approveAllOpen, approveAllButtonRef);

  const proposals = useMemo(
    () => [...(inbox.data ?? [])].sort((a, b) => createdTime(b.meta.created) - createdTime(a.meta.created)),
    [inbox.data],
  );

  // A `?pack=` filter shows only proposals proposed by that pack, so links like
  // "Review in Inbox" from Home land on exactly the right proposals.
  const packFiltered = useMemo(
    () => (packFilter ? proposals.filter((proposal) => packProposer(proposal.meta.proposed_by)?.name === packFilter) : proposals),
    [proposals, packFilter],
  );

  const counts = useMemo(() => {
    const create = packFiltered.filter((proposal) => proposal.meta.action === "create").length;
    return { all: packFiltered.length, create, update: packFiltered.length - create };
  }, [packFiltered]);

  const visible = useMemo(
    () => (filter === "all" ? packFiltered : packFiltered.filter((proposal) => proposal.meta.action === filter)),
    [filter, packFiltered],
  );
  const approveAllCount = visible.length;
  const showApproveAll = approveAllCount >= 2;
  const approveAllRequest = (): ApproveAllRequest => {
    const request: ApproveAllRequest = {};
    if (packFilter) request.pack = packFilter;
    if (filter !== "all") request.action = filter;
    return request;
  };

  const packGroups = useMemo(
    () =>
      groupPackProposals(proposals)
        .filter((group) => (packFilter ? group.name === packFilter : true))
        .filter((group) => group.proposals.length >= 2),
    [proposals, packFilter],
  );

  const current = visible[selected];
  const currentId = current?.id;
  const detailQuery = useProposal(wide ? currentId : undefined);
  const detail = detailQuery.data;
  const editedId = useRef<string | undefined>(undefined);

  useEffect(() => {
    setSelected((value) => Math.min(value, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  // Keep the URL and the selected row in sync in both directions on wide screens.
  // A parameter adopted from the URL must win over the initial default selection,
  // and a deep link that arrives before the inbox has loaded waits for the data.
  useEffect(() => {
    if (!wide || detailRoute) {
      // The narrow list and the detail page both own their own URL; only the
      // wide master-detail view on `/inbox` syncs the selected row to `?p=`.
      if (!wide) {
        lastParam.current = null;
        pendingParam.current = null;
      }
      return;
    }
    if (pParam !== lastParam.current) {
      lastParam.current = pParam;
      pendingParam.current = pParam;
    }
    if (pendingParam.current) {
      const index = visible.findIndex((proposal) => proposal.id === pendingParam.current);
      if (index >= 0) {
        pendingParam.current = null;
        setSelected(index);
        return;
      }
      if (inbox.isPending) return;
      pendingParam.current = null;
    }
    const next = visible[selected]?.id ?? null;
    if (next === pParam) return;
    lastParam.current = next;
    const params = new URLSearchParams(searchParams);
    if (next) params.set("p", next);
    else params.delete("p");
    setSearchParams(params, { replace: true });
  }, [wide, detailRoute, pParam, visible, selected, searchParams, setSearchParams, inbox.isPending]);

  useEffect(() => {
    document.getElementById(`proposal-card-${selected}`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    if (editedId.current === currentId) return;
    editedId.current = currentId;
    setEditOpen(false);
    setErrors({});
  }, [currentId]);

  useEffect(() => () => window.clearTimeout(armTimer.current), []);
  useEffect(() => () => window.clearTimeout(packTimer.current), []);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

  const approve = useMutation({
    mutationFn: (id: string) => approveProposal(id),
    onSuccess: (note) => {
      invalidate();
      toast.success(t("proposal.approved"), {
        label: t("inbox.openNote"),
        onClick: () => navigate({ pathname: `/notes/${encodeURIComponent(note.id)}`, search: "" }),
      });
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 404) {
        invalidate();
        toast.error(t("proposal.gone"));
        return;
      }
      if (error instanceof ApiRequestError && error.status === 409) {
        toast.error(t("inbox.approveConflict"));
        return;
      }
      toast.error(t("inbox.approveFailed"));
    },
  });

  const editApprove = useMutation({
    mutationFn: (input: { id: string; data: NoteData; body: string }) => approveProposal(input.id, input),
    onSuccess: () => {
      setEditOpen(false);
      invalidate();
      toast.success(t("proposal.approved"));
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 404) {
        setEditOpen(false);
        invalidate();
        toast.error(t("proposal.gone"));
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
    mutationFn: (id: string) => rejectProposal(id),
    onSuccess: () => {
      invalidate();
      toast.success(t("proposal.rejected"));
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 404) {
        invalidate();
        toast.error(t("proposal.gone"));
        return;
      }
      toast.error(t("inbox.rejectFailed"));
    },
  });

  const approveAll = useMutation({
    mutationFn: ({ request }: ApproveAllVariables) => approveAllProposals(request),
    onSuccess: (data, variables) => {
      invalidate();
      if (variables.mode === "pack" && data.failed.length === 0) {
        toast.success(t("inbox.approveAllDone", { count: data.approved.length }));
        return;
      }
      const message = t("inbox.approveAllResult", { approved: data.approved.length, kept: data.failed.length });
      if (data.approved.length) toast.success(message);
      else toast.error(message);
    },
    onError: () => toast.error(t("inbox.approveAllFailed")),
  });

  const arm = (id: string) => {
    window.clearTimeout(armTimer.current);
    setArmed(id);
    armTimer.current = window.setTimeout(() => setArmed(null), 3000);
  };

  const requestReject = (id: string) => {
    if (armed === id) {
      window.clearTimeout(armTimer.current);
      setArmed(null);
      reject.mutate(id);
      return;
    }
    arm(id);
  };

  const requestApproveAll = (pack: string, version: string, key: string) => {
    if (armedPack === key) {
      window.clearTimeout(packTimer.current);
      setArmedPack(null);
      approveAll.mutate({ request: { pack, version }, mode: "pack" });
      return;
    }
    window.clearTimeout(packTimer.current);
    setArmedPack(key);
    packTimer.current = window.setTimeout(() => setArmedPack(null), 3000);
  };

  const select = (id: string) => {
    const index = visible.findIndex((proposal) => proposal.id === id);
    if (index >= 0) setSelected(index);
  };

  const open = (id: string) => {
    if (wide) {
      select(id);
      return;
    }
    navigate(`/inbox/${encodeURIComponent(id)}`);
  };

  const openFull = (id: string) => navigate({ pathname: `/inbox/${encodeURIComponent(id)}`, search: "" });

  const openEdit = () => {
    if (!current || !detail) return;
    setErrors({});
    setEditOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (editOpen) return;
      const active = visible[selected];
      if (!active) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const actionTarget = target?.closest("button, a");
      if (event.key === "Enter" && actionTarget && !target?.closest("[data-proposal-open]")) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((index) => Math.min(index + 1, visible.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((index) => Math.max(index - 1, 0));
      } else if (event.key === "Enter") {
        event.preventDefault();
        openFull(active.id);
      } else if (event.key.toLowerCase() === "a") {
        if (approve.isPending || reject.isPending) return;
        event.preventDefault();
        approve.mutate(active.id);
      } else if (event.key.toLowerCase() === "r") {
        if (approve.isPending || reject.isPending) return;
        event.preventDefault();
        requestReject(active.id);
      } else if (event.key.toLowerCase() === "e") {
        if (!wide) {
          event.preventDefault();
          openFull(active.id);
          return;
        }
        if (detail) {
          event.preventDefault();
          openEdit();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const onCardKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>, index: number) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setSelected(Math.max(0, Math.min(index + (event.key === "ArrowDown" ? 1 : -1), visible.length - 1)));
    }
  };

  const packBar =
    packGroups.length > 0 ? (
      <div className="flex flex-col gap-1.5">
        {packGroups.map((group) => {
          const busy =
            approveAll.isPending &&
            approveAll.variables?.request.pack === group.name &&
            approveAll.variables?.request.version === group.version;
          const confirms = armedPack === group.from;
          return (
            <div
              key={group.from}
              data-pack={group.name}
              className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-card/50 px-3 py-1.5"
            >
              <Package className="hidden size-3.5 shrink-0 text-muted-foreground sm:block" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-xs">
                <span className="font-mono font-medium">{group.name}</span>{" "}
                <span className="hidden font-mono text-muted-foreground sm:inline">{group.version}</span>
                <span aria-hidden="true" className="text-muted-foreground/60">
                  {" · "}
                </span>
                <span className="text-muted-foreground">{t("inbox.updates", { count: group.proposals.length })}</span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                pressScale={0.97}
                disabled={busy}
                onClick={() => requestApproveAll(group.name, group.version, group.from)}
                className={confirms ? "h-7 shrink-0 border-destructive/40 px-3 text-destructive" : "h-7 shrink-0 px-3"}
              >
                {confirms ? t("inbox.approveAllConfirm") : t("inbox.approveAll")}
              </Button>
            </div>
          );
        })}
      </div>
    ) : null;

  const emptyState = (
    <div className="flex min-h-64 flex-col items-center justify-center gap-1 px-4 py-10 text-center">
      <p className="text-sm font-medium">{t("state.empty.title")}</p>
      <p className="text-xs text-muted-foreground">{t("state.empty.description")}</p>
    </div>
  );

  // With nothing pending the whole content area shows one empty state instead of
  // a split list + detail, both claiming the inbox is empty.
  const zeroState = (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-10 text-center min-[1280px]:min-h-full">
      <span className="grid size-10 place-items-center rounded-full bg-muted/60 text-muted-foreground">
        <InboxIcon className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm font-medium">{t("inbox.emptyZero")}</p>
      <p className="max-w-md text-xs leading-5 text-muted-foreground">
        {t("inbox.emptyHint")}{" "}
        <a
          href={README_PROPOSE}
          target="_blank"
          rel="noreferrer"
          className="rounded-sm underline decoration-border underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("inbox.readme")}
        </a>
      </p>
    </div>
  );

  const nothingPending = !inbox.isPending && !inbox.error && packFiltered.length === 0;

  return (
    <Page className={`${PAGE_SECTIONS} min-h-0`}>
      <span className="sr-only">{t("inbox.shortcuts")}</span>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{t("page.inbox.title")}</h1>
          <span className="inline-flex items-baseline gap-1.5 text-xs text-muted-foreground">
            <AnimatedNumber
              value={packFiltered.length}
              startOnView={false}
              duration={0.5}
              className="text-sm font-medium text-foreground"
            />
            {t("inbox.pending")}
            {packFilter ? (
              <button
                type="button"
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.delete("pack");
                  setSearchParams(params, { replace: true });
                  setSelected(0);
                }}
                className="ml-2 rounded-sm text-xs text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {t("inbox.clearPackFilter", { pack: packFilter })}
              </button>
            ) : null}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {showApproveAll ? (
            <Button
              ref={approveAllButtonRef}
              variant="primary"
              size="sm"
              pressScale={0.97}
              disabled={approveAll.isPending}
              aria-haspopup="dialog"
              aria-expanded={approveAllOpen}
              onClick={() => setApproveAllOpen(true)}
              className="h-8 shrink-0"
            >
              {t("inbox.approveAllCount", { count: approveAllCount })}
            </Button>
          ) : null}
          <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)} variant="segment">
            <TabsList>
              {(
                [
                  ["all", t("type.all"), counts.all],
                  ["create", t("proposal.action.create"), counts.create],
                  ["update", t("proposal.action.update"), counts.update],
                ] as const
              ).map(([value, label, count]) => (
                <TabsTrigger key={value} value={value} className="gap-1.5 px-3 py-1 text-xs">
                  {label}
                  <span className="font-mono text-[11px]">{count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </header>

      {nothingPending ? (
        zeroState
      ) : (
        <div className="grid min-h-0 gap-4 min-[1280px]:h-[calc(100dvh-16rem)] min-[1280px]:grid-cols-[420px_minmax(0,1fr)]">
          <div className="flex min-h-0 min-w-0 flex-col">
            {packBar ? <div className="mb-3">{packBar}</div> : null}

            {/* Inset the scroll box so card rings and focus outlines are not cut at the edges;
                the negative margin keeps the cards aligned with the page grid. */}
            <div
              data-testid="inbox-list"
              className="min-h-0 flex-1 min-[1280px]:-m-1.5 min-[1280px]:overflow-y-auto min-[1280px]:overscroll-contain min-[1280px]:p-1.5"
            >
              {inbox.isPending ? (
                <div className="py-10">
                  <Loading />
                </div>
              ) : inbox.error ? (
                <div className="py-10">
                  <ErrorState error={inbox.error} />
                </div>
              ) : visible.length === 0 ? (
                emptyState
              ) : (
                <div className="grid gap-3 min-[640px]:grid-cols-2 min-[1280px]:grid-cols-1">
                  <AnimatePresence initial mode="popLayout">
                    {visible.map((proposal, index) => {
                      const busy =
                        (approve.isPending && approve.variables === proposal.id) || (reject.isPending && reject.variables === proposal.id);
                      const typeLabel = t(`type.${proposal.type}` as TranslationKey);
                      const name = proposal.meta.proposed_by;
                      const pack = packProposer(name);
                      return (
                        <motion.div
                          key={proposal.id}
                          id={`proposal-card-${index}`}
                          data-proposal-id={proposal.id}
                          layout={!reduce}
                          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={
                            reduce
                              ? { opacity: 0, transition: { duration: 0 } }
                              : { opacity: 0, scale: 0.97, transition: { type: "spring", stiffness: 420, damping: 34 } }
                          }
                          transition={
                            reduce
                              ? { duration: 0 }
                              : {
                                  layout: SPRING_LAYOUT,
                                  opacity: { duration: 0.18, ease: EASE_OUT, delay: Math.min(index, 9) * 0.02 },
                                  y: { duration: 0.18, ease: EASE_OUT, delay: Math.min(index, 9) * 0.02 },
                                }
                          }
                          onKeyDown={(event) => onCardKeyDown(event, index)}
                          className="min-w-0"
                        >
                          <ApprovalCard
                            title={proposal.title || proposal.id}
                            subtitle={proposal.id}
                            actionLabel={t(proposal.meta.action === "create" ? "proposal.action.create" : "proposal.action.update")}
                            action={proposal.meta.action}
                            typeLabel={typeLabel}
                            typeColor={`var(--type-${proposal.type})`}
                            agentName={pack ? t("inbox.byPack", { name: pack.name, version: pack.version }) : t("inbox.by", { name })}
                            agentInitial={agentInitial(name)}
                            agentColor={agentColor(name)}
                            agentForeground="#111113"
                            agentKind={pack ? "pack" : "agent"}
                            reason={proposal.meta.reason}
                            time={
                              <time dateTime={proposal.meta.created} title={proposal.meta.created}>
                                {formatRelativeTime(proposal.meta.created, language)}
                              </time>
                            }
                            status={busy ? "submitting" : "pending"}
                            selected={index === selected}
                            busy={busy}
                            approveLabel={t("proposal.approve")}
                            rejectLabel={t("proposal.reject")}
                            rejectConfirmLabel={t("proposal.rejectConfirm")}
                            rejectArmed={armed === proposal.id}
                            onOpen={() => open(proposal.id)}
                            onApprove={() => approve.mutate(proposal.id)}
                            onReject={() => requestReject(proposal.id)}
                          />
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </div>

          <aside
            aria-label={t("page.inbox.title")}
            className="hidden min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card/20 min-[1280px]:flex"
          >
            {inbox.isPending || (Boolean(current) && detailQuery.isPending) ? (
              <div className="grid h-full place-items-center">
                <Loading />
              </div>
            ) : detailQuery.error ? (
              <div className="p-4">
                <ErrorState error={detailQuery.error} />
              </div>
            ) : detail && current ? (
              <ProposalDetail
                variant="panel"
                proposal={detail}
                busy={
                  (approve.isPending && approve.variables === current.id) ||
                  (reject.isPending && reject.variables === current.id) ||
                  editApprove.isPending
                }
                armed={armed === current.id}
                editButtonRef={editButtonRef}
                onApprove={() => approve.mutate(current.id)}
                onReject={() => requestReject(current.id)}
                onEdit={openEdit}
              />
            ) : (
              <p className="m-auto max-w-sm px-6 text-center text-sm text-muted-foreground">{t("inbox.empty")}</p>
            )}
          </aside>
        </div>
      )}

      {detail && current ? (
        <ProposalEditModal
          proposal={detail}
          open={editOpen}
          onOpenChange={setEditOpen}
          errors={errors}
          pending={editApprove.isPending}
          onSubmit={(data, body) => editApprove.mutate({ id: current.id, data, body })}
        />
      ) : null}

      <CenterMorphModal open={approveAllOpen} onOpenChange={setApproveAllOpen}>
        <CenterMorphModalContent
          ariaLabel={t("inbox.approveAllTitle")}
          ariaDescribedBy="inbox-approve-all-prompt"
          closeButtonLabel={t("proposal.cancel")}
          showCloseButton={false}
          className="max-w-md p-6"
        >
          <h2 className="text-base font-semibold tracking-tight">{t("inbox.approveAllTitle")}</h2>
          <p id="inbox-approve-all-prompt" className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("inbox.approveAllPrompt", { count: approveAllCount })}
          </p>
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" pressScale={0.97} onClick={() => setApproveAllOpen(false)}>
              {t("proposal.cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              pressScale={0.97}
              disabled={approveAll.isPending}
              onClick={() => {
                setApproveAllOpen(false);
                approveAll.mutate({ request: approveAllRequest(), mode: "header" });
              }}
            >
              {t("inbox.approveAll")}
            </Button>
          </div>
        </CenterMorphModalContent>
      </CenterMorphModal>
    </Page>
  );
}
