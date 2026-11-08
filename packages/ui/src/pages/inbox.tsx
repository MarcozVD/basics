import type { ApproveAllRequest, ApproveAllResponse, ProposalSummary, RejectAllResponse } from "@marcozvd/basics-core";
import { Inbox as InboxIcon, LoaderCircle, Package } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent as ReactKeyboardEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, useMatch } from "react-router";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Button } from "@/components/motion/button/base";
import { CenterMorphModal, CenterMorphModalContent } from "@/components/motion/center-morph-modal";
import { Checkbox } from "@/components/motion/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/motion/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { PAGE_SECTIONS, Page, Reveal } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { ProposalDetail, ProposalEditModal } from "@/components/proposal-detail";
import { ErrorState, Loading } from "@/components/state";
import { Button as LinkButton } from "@/components/ui/button";
import { type TranslationKey, useI18n } from "@/i18n";
import { agentColor, agentInitial } from "@/lib/agent-color";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/ease";
import { useIntentNavigate } from "@/lib/intent-navigate";
import { useIntro } from "@/lib/intro";
import { groupPackProposals, packProposer } from "@/lib/packs";
import { useFirstPaint, useProgressiveCount } from "@/lib/progressive";
import { useInbox, useProposal, useStats } from "@/lib/queries";
import { formatRelativeTime } from "@/lib/relative-time";
import { useReturnFocus } from "@/lib/return-focus";
import { type BulkMode, useReviewQueue } from "@/lib/review-queue";
import { useRouteSearchParams } from "@/lib/route-query";
import { cn } from "@/lib/utils";

type Filter = "all" | "create" | "update";
type RejectMode = "all" | "selection";

/** Sentinel for the agent select's "all agents" row; no `proposed_by` uses it. */
const ALL_AGENTS = "__all__";

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

/**
 * One compact list row: kind, title, author and age. Approve and reject live in the
 * detail panel on wide screens (and on the proposal page when narrow), so the list
 * can carry a whole screenful without repeating the same two buttons on every card.
 */
function InboxRow({
  proposal,
  selected,
  busy,
  checked,
  selectable,
  selectionMode,
  selectLabel,
  onSelectPointerDown,
  onCheckedChange,
  onOpen,
}: {
  proposal: ProposalSummary;
  selected: boolean;
  busy: boolean;
  checked: boolean;
  selectable: boolean;
  selectionMode: boolean;
  selectLabel: string;
  onSelectPointerDown: (shiftKey: boolean) => void;
  onCheckedChange: () => void;
  onOpen: () => void;
}) {
  const { t, language } = useI18n();
  const reduce = useReducedMotion() ?? false;
  const name = proposal.meta.proposed_by;
  const pack = packProposer(name);
  const title = proposal.title || proposal.id;
  const action = t(proposal.meta.action === "create" ? "proposal.action.create" : "proposal.action.update");
  const type = t(`type.${proposal.type}` as TranslationKey);

  return (
    <div
      data-state={busy ? "submitting" : "pending"}
      aria-busy={busy}
      className="group/row relative rounded-xl bg-muted/30 ring-1 ring-border/70 transition-colors"
    >
      {selected ? (
        <motion.span
          layoutId="inbox-focus-ring"
          transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
          className="pointer-events-none absolute inset-0 rounded-xl ring-2 ring-ring"
          aria-hidden="true"
        />
      ) : null}

      {selectable ? (
        <span
          className={cn(
            "absolute top-3 left-3 z-10 transition-opacity",
            selectionMode ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100",
          )}
          onPointerDown={(event) => onSelectPointerDown(event.shiftKey)}
        >
          <Checkbox checked={checked} onCheckedChange={() => onCheckedChange()} aria-label={selectLabel} className="gap-0" />
        </span>
      ) : null}

      <button
        type="button"
        data-proposal-open
        onClick={onOpen}
        className={cn("flex w-full min-w-0 flex-col gap-1 rounded-xl px-3 py-2.5 text-left outline-none", selectable && "pl-10")}
      >
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{title}</span>
          <time dateTime={proposal.meta.created} title={proposal.meta.created} className="shrink-0 text-[11px] text-muted-foreground">
            {formatRelativeTime(proposal.meta.created, language)}
          </time>
        </span>

        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex shrink-0 items-center gap-1.5">
            {busy ? (
              <LoaderCircle className={cn("size-3", !reduce && "animate-spin")} aria-hidden="true" />
            ) : (
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full ring-1 ring-black/10 dark:ring-white/20"
                style={{ backgroundColor: `var(--type-${proposal.type})` }}
              />
            )}
            {type}
          </span>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ·
          </span>
          <span className="shrink-0 font-medium text-foreground/80">{action}</span>
          <span aria-hidden="true" className="text-muted-foreground/50">
            ·
          </span>
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                "grid size-4 shrink-0 place-items-center rounded-md font-mono text-[9px] font-semibold",
                pack && "bg-muted text-muted-foreground ring-1 ring-border",
              )}
              style={pack ? undefined : { backgroundColor: agentColor(name), color: "#111113" }}
            >
              {pack ? <Package className="size-2.5" /> : agentInitial(name)}
            </span>
            <span className="truncate">
              {pack ? t("inbox.byPack", { name: pack.name, version: pack.version }) : t("inbox.by", { name })}
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}

export function InboxPage() {
  const { t } = useI18n();
  const navigate = useIntentNavigate();
  const [searchParams, setSearchParams] = useRouteSearchParams();
  // This page can stay mounted for one render after the router enters `/inbox/:id`.
  // While that detail route owns the URL, the list must not write its own `?p=`.
  const detailRoute = useMatch("/inbox/:id") !== null;
  const wide = useWideInbox();
  const reduce = useReducedMotion() ?? false;
  const { pendingIds, busy: queueBusy, queueApprove, queueReject, queueApproveAll, queueRejectAll } = useReviewQueue();
  const inbox = useInbox();
  const stats = useStats();
  const vaultEmpty = stats.data?.total === 0;
  const [filter, setFilter] = useState<Filter>("all");
  const [agent, setAgent] = useState(ALL_AGENTS);
  const [selected, setSelected] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  const armTimer = useRef<number | undefined>(undefined);
  const [armedPack, setArmedPack] = useState<string | null>(null);
  const packTimer = useRef<number | undefined>(undefined);
  const [editOpen, setEditOpen] = useState(false);
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState<RejectMode | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const editButtonRef = useRef<HTMLButtonElement>(null);
  const approveAllButtonRef = useRef<HTMLButtonElement>(null);
  const rejectAllButtonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const anchorIndex = useRef<number | null>(null);
  const shiftPick = useRef(false);
  const lastParam = useRef<string | null>(null);
  const pendingParam = useRef<string | null>(null);
  const pParam = searchParams.get("p");
  const packFilter = searchParams.get("pack");

  useReturnFocus(editOpen, editButtonRef);
  useReturnFocus(approveAllOpen, approveAllButtonRef);
  useReturnFocus(rejectOpen !== null, rejectAllButtonRef);

  const proposals = useMemo(
    () => [...(inbox.data ?? [])].sort((a, b) => createdTime(b.meta.created) - createdTime(a.meta.created)),
    [inbox.data],
  );

  // An inbox with nothing to review has no data yet: its intro stays under the title (with
  // the empty state below it) until the user dismisses it or a proposal arrives.
  const intro = useIntro("inbox", inbox.isSuccess ? proposals.length > 0 : true);

  // A `?pack=` filter shows only proposals proposed by that pack, so links like
  // "Review in Inbox" from Home land on exactly the right proposals.
  const packFiltered = useMemo(
    () => (packFilter ? proposals.filter((proposal) => packProposer(proposal.meta.proposed_by)?.name === packFilter) : proposals),
    [proposals, packFilter],
  );

  // Agents are the distinct `proposed_by` values pending in the current pack
  // scope. The select only appears when there is more than one to choose from.
  const agents = useMemo(
    () => [...new Set(packFiltered.map((proposal) => proposal.meta.proposed_by))].sort((a, b) => a.localeCompare(b)),
    [packFiltered],
  );
  const agentFiltered = useMemo(
    () => (agent === ALL_AGENTS ? packFiltered : packFiltered.filter((proposal) => proposal.meta.proposed_by === agent)),
    [agent, packFiltered],
  );

  useEffect(() => {
    if (agent === ALL_AGENTS) return;
    if (agents.length <= 1 || !agents.includes(agent)) setAgent(ALL_AGENTS);
  }, [agent, agents]);

  const counts = useMemo(() => {
    const create = agentFiltered.filter((proposal) => proposal.meta.action === "create").length;
    return { all: agentFiltered.length, create, update: agentFiltered.length - create };
  }, [agentFiltered]);

  const visible = useMemo(
    () => (filter === "all" ? agentFiltered : agentFiltered.filter((proposal) => proposal.meta.action === filter)),
    [filter, agentFiltered],
  );
  // Long inboxes mount the first screenful, then fill in idle slices.
  const firstPaint = useFirstPaint();
  const renderLimit = useProgressiveCount(visible.length, `${filter}|${packFilter ?? ""}|${agent}`, {
    active: firstPaint,
    initial: 6,
    chunk: 10,
  });
  const visibleWindow = firstPaint ? Math.max(renderLimit, selected + 1) : 0;
  const visibleIds = useMemo(() => new Set(visible.map((proposal) => proposal.id)), [visible]);

  /** Focus the visible row at `index`, after React has painted any new rows. */
  const focusRow = useCallback((index: number) => {
    const row = listRef.current?.querySelector<HTMLButtonElement>(`#proposal-card-${index} [data-proposal-open]`);
    row?.focus({ preventScroll: true });
  }, []);

  const moveSelection = (next: number) => {
    const bounded = Math.max(0, Math.min(next, visible.length - 1));
    setSelected(bounded);
    requestAnimationFrame(() => focusRow(bounded));
  };
  // The selection only ever counts proposals that are still visible: it is not stored
  // in the URL, and a filter change drops the ids it hides.
  const pickedVisible = useMemo(() => visible.filter((proposal) => picked.has(proposal.id)), [visible, picked]);
  const pickedIds = pickedVisible.map((proposal) => proposal.id);
  const selectionActive = pickedVisible.length > 0;
  const approveAllCount = visible.length;
  // Keep both bulk buttons mounted at one pending: hiding them shifted the
  // filter tabs by a few pixels. They disable instead.
  const showBulkActions = approveAllCount > 0;
  const bulkDisabled = queueBusy || approveAllCount < 2;
  const showAgentFilter = agents.length > 1;

  useEffect(() => {
    setPicked((previous) => {
      const next = new Set([...previous].filter((id) => visibleIds.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [visibleIds]);
  const approveAllRequest = (): ApproveAllRequest => {
    const request: ApproveAllRequest = {};
    // A chosen agent is an exact `proposed_by`, so it already narrows a pack
    // scope; the server rejects pack and agent together.
    if (agent !== ALL_AGENTS) request.agent = agent;
    else if (packFilter) request.pack = packFilter;
    if (filter !== "all") request.action = filter;
    return request;
  };

  const approveAllLabel =
    agent === ALL_AGENTS
      ? t("inbox.approveAllCount", { count: approveAllCount })
      : t("inbox.approveAllFrom", { count: approveAllCount, agent });

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

  // On load the selected row takes focus, so arrows and shortcuts act on the
  // list without a click. Never steal focus the user already moved elsewhere.
  useEffect(() => {
    if (detailRoute || inbox.isPending || !currentId || visibleWindow === 0) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && active !== document.documentElement) return;
    const frame = requestAnimationFrame(() => focusRow(selected));
    return () => cancelAnimationFrame(frame);
  }, [currentId, detailRoute, inbox.isPending, selected, visibleWindow, focusRow]);

  useEffect(() => {
    if (editedId.current === currentId) return;
    editedId.current = currentId;
    setEditOpen(false);
    setErrors({});
  }, [currentId]);

  useEffect(() => () => window.clearTimeout(armTimer.current), []);
  useEffect(() => () => window.clearTimeout(packTimer.current), []);

  /** Select the next proposal at once and return a restore for undo or failure. */
  const advanceSelection = (id: string): (() => void) | undefined => {
    const index = visible.findIndex((proposal) => proposal.id === id);
    if (index < 0) return undefined;
    setSelected(Math.min(index + 1, visible.length - 1));
    return () => setSelected(index);
  };

  const titleOf = (proposal: ProposalSummary) => proposal.title || proposal.id;

  const approveCurrent = (id: string) => {
    const proposal = visible.find((item) => item.id === id);
    if (!proposal || pendingIds.has(id)) return;
    const restore = advanceSelection(id);
    queueApprove({ id, title: titleOf(proposal), callbacks: { onUndo: restore, onError: restore } });
  };

  const rejectNow = (proposal: ProposalSummary) => {
    if (pendingIds.has(proposal.id)) return;
    const restore = advanceSelection(proposal.id);
    queueReject({ id: proposal.id, title: titleOf(proposal), callbacks: { onUndo: restore, onError: restore } });
  };

  const approveAllNow = (mode: BulkMode) => {
    if (queueBusy) return;
    const ids = visible.map((proposal) => proposal.id);
    queueApproveAll({
      request: approveAllRequest(),
      ids,
      count: ids.length,
      mode,
      callbacks: {
        onSuccess: (result) => {
          if (mode !== "selection") return;
          const data = result as ApproveAllResponse;
          setPicked(new Set(data.failed.map((failure) => failure.id)));
        },
      },
    });
  };

  const approveSelectionNow = () => {
    if (queueBusy || pickedIds.length === 0) return;
    queueApproveAll({
      request: { ids: pickedIds },
      ids: pickedIds,
      count: pickedIds.length,
      mode: "selection",
      callbacks: {
        onSuccess: (result) => {
          const data = result as ApproveAllResponse;
          setPicked(new Set(data.failed.map((failure) => failure.id)));
        },
      },
    });
  };

  const rejectSelectionNow = () => {
    if (queueBusy) return;
    const ids = [...pickedIds];
    queueRejectAll({
      request: { ids },
      ids,
      count: ids.length,
      mode: "selection",
      callbacks: {
        onSuccess: (result) => {
          const data = result as RejectAllResponse;
          setPicked(new Set(data.failed.map((failure) => failure.id)));
        },
      },
    });
  };

  const rejectVisibleNow = () => {
    if (queueBusy) return;
    const ids = visible.map((proposal) => proposal.id);
    queueRejectAll({ request: approveAllRequest(), ids, count: ids.length, mode: "header" });
  };

  const arm = (id: string) => {
    window.clearTimeout(armTimer.current);
    setArmed(id);
    armTimer.current = window.setTimeout(() => setArmed(null), 3000);
  };

  const requestReject = (id: string) => {
    if (armed === id) {
      window.clearTimeout(armTimer.current);
      setArmed(null);
      const proposal = visible.find((item) => item.id === id);
      if (proposal) rejectNow(proposal);
      return;
    }
    arm(id);
  };

  const requestApproveAll = (pack: string, version: string, key: string, ids: string[]) => {
    if (armedPack === key) {
      window.clearTimeout(packTimer.current);
      setArmedPack(null);
      if (queueBusy) return;
      queueApproveAll({ request: { pack, version }, ids, count: ids.length, mode: "pack" });
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

  /** Toggle a card's checkbox; Shift extends the selection from the last clicked card. */
  const togglePick = (id: string, shiftKey = false) => {
    const index = visible.findIndex((proposal) => proposal.id === id);
    if (index < 0) return;
    setPicked((previous) => {
      const next = new Set(previous);
      if (shiftKey && anchorIndex.current !== null) {
        const [from, to] = anchorIndex.current < index ? [anchorIndex.current, index] : [index, anchorIndex.current];
        for (let i = from; i <= to; i++) next.add(visible[i].id);
        return next;
      }
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchorIndex.current = index;
  };

  const clearSelection = () => {
    anchorIndex.current = null;
    setPicked(new Set());
  };

  const confirmReject = () => {
    const mode = rejectOpen;
    setRejectOpen(null);
    if (mode === "selection") rejectSelectionNow();
    else if (mode === "all") rejectVisibleNow();
  };

  const rejectCount = rejectOpen === "selection" ? pickedVisible.length : approveAllCount;

  const openEdit = () => {
    if (!current || !detail) return;
    setErrors({});
    setEditOpen(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (isTypingTarget(event.target)) return;
      if (editOpen) return;
      const list = listRef.current;
      const active = document.activeElement;
      const listFocused = list !== null && active instanceof HTMLElement && list.contains(active);

      // Ctrl/Cmd+A selects every visible proposal, but only while the list has focus.
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "a") {
        if (!listFocused || visible.length === 0) return;
        event.preventDefault();
        setPicked(new Set(visible.map((proposal) => proposal.id)));
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Escape") {
        if (selectionActive) {
          event.preventDefault();
          clearSelection();
        }
        return;
      }

      const focused = visible[selected];
      if (!focused) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const actionTarget = target?.closest("button, a");
      if (event.key === "Enter" && actionTarget && !target?.closest("[data-proposal-open]")) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveSelection(selected + 1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        moveSelection(selected - 1);
      } else if (event.key === "Enter") {
        event.preventDefault();
        openFull(focused.id);
      } else if (event.key.toLowerCase() === "x") {
        event.preventDefault();
        togglePick(focused.id);
      } else if (event.key.toLowerCase() === "a") {
        if (pendingIds.has(focused.id)) return;
        event.preventDefault();
        approveCurrent(focused.id);
      } else if (event.key.toLowerCase() === "r") {
        if (pendingIds.has(focused.id)) return;
        event.preventDefault();
        requestReject(focused.id);
      } else if (event.key.toLowerCase() === "e") {
        if (!wide) {
          event.preventDefault();
          openFull(focused.id);
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
      moveSelection(index + (event.key === "ArrowDown" ? 1 : -1));
    }
  };

  const packBar =
    packGroups.length > 0 ? (
      <div className="flex flex-col gap-1.5">
        {packGroups.map((group) => {
          const busy = queueBusy;
          const confirms = armedPack === group.from;
          return (
            <div
              key={group.from}
              data-pack={group.name}
              className="flex min-w-0 items-center gap-2 rounded-xl border border-border/70 bg-muted/50 px-3 py-1.5"
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
                onClick={() =>
                  requestApproveAll(
                    group.name,
                    group.version,
                    group.from,
                    group.proposals.map((proposal) => proposal.id),
                  )
                }
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
      <p className="max-w-md text-sm leading-5 text-muted-foreground">{t(vaultEmpty ? "inbox.emptyVaultLead" : "inbox.emptyLead")}</p>
      <p className="max-w-md text-xs leading-5 text-muted-foreground">
        {t("inbox.emptyHint")} <code className="font-mono text-[12px] text-foreground">propose_note</code>
        {t("inbox.emptyHintEnd")}{" "}
        <a
          href={README_PROPOSE}
          target="_blank"
          rel="noreferrer"
          className="rounded-sm underline decoration-border underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("inbox.readme")}
        </a>
      </p>
      <LinkButton asChild size="sm" className="mt-2">
        <Link to={vaultEmpty ? "/?packs=1" : "/settings?section=agents"}>
          {t(vaultEmpty ? "inbox.emptyAction.packs" : "inbox.emptyAction.agent")}
        </Link>
      </LinkButton>
    </div>
  );

  const nothingPending = !inbox.isPending && !inbox.error && packFiltered.length === 0;

  return (
    <Page className={`${PAGE_SECTIONS} min-h-0`}>
      <span className="sr-only">{t("inbox.shortcuts")}</span>
      <Reveal index={0}>
        <PageHeader
          title={t("page.inbox.title")}
          meta={
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
          }
          description={intro.showIntro ? t("inbox.intro") : undefined}
          hint={intro.showIntro ? undefined : t("inbox.intro")}
          onDismissDescription={intro.showIntro ? intro.dismiss : undefined}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {selectionActive ? (
                <section
                  aria-label={t("inbox.selectionBar")}
                  className="flex flex-wrap items-center gap-2"
                  data-testid="inbox-selection-bar"
                >
                  <span className="text-sm font-medium tabular-nums">{t("inbox.selectedCount", { count: pickedVisible.length })}</span>
                  <Button
                    variant="primary"
                    size="sm"
                    pressScale={0.97}
                    disabled={queueBusy}
                    className="h-8 shrink-0"
                    onClick={approveSelectionNow}
                  >
                    {t("inbox.approveSelected")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    pressScale={0.97}
                    disabled={queueBusy}
                    className="h-8 shrink-0 border-destructive/40 text-destructive"
                    onClick={() => setRejectOpen("selection")}
                  >
                    {t("inbox.rejectSelected")}
                  </Button>
                  <Button variant="ghost" size="sm" pressScale={0.97} className="h-8 shrink-0" onClick={clearSelection}>
                    {t("inbox.clearSelection")}
                  </Button>
                </section>
              ) : (
                <>
                  {showBulkActions ? (
                    <Button
                      ref={rejectAllButtonRef}
                      variant="secondary"
                      size="sm"
                      pressScale={0.97}
                      disabled={bulkDisabled}
                      className="h-8 shrink-0 border-destructive/40 text-destructive"
                      onClick={() => setRejectOpen("all")}
                    >
                      {t("inbox.rejectAllCount", { count: approveAllCount })}
                    </Button>
                  ) : null}
                  {showBulkActions ? (
                    <Button
                      ref={approveAllButtonRef}
                      variant="primary"
                      size="sm"
                      pressScale={0.97}
                      disabled={bulkDisabled}
                      aria-haspopup="dialog"
                      aria-expanded={approveAllOpen}
                      onClick={() => setApproveAllOpen(true)}
                      className="h-8 shrink-0"
                    >
                      {approveAllLabel}
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
                  {showAgentFilter ? (
                    <Select
                      value={agent}
                      onValueChange={(value) => {
                        setAgent(value);
                        setSelected(0);
                      }}
                    >
                      <SelectTrigger
                        aria-label={t("inbox.filterAgent")}
                        title={t("inbox.filterAgent")}
                        className="h-8 w-40 shrink-0 rounded-lg border-border bg-card px-3 py-0 text-xs"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="w-56">
                        <SelectItem value={ALL_AGENTS}>{t("inbox.allAgents")}</SelectItem>
                        {agents.map((name) => (
                          <SelectItem key={name} value={name}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </>
              )}
            </div>
          }
        />
      </Reveal>

      {nothingPending ? (
        <Reveal index={1}>{zeroState}</Reveal>
      ) : (
        <div className="grid min-h-0 gap-4 min-[1280px]:flex-1 min-[1280px]:grid-cols-[420px_minmax(0,1fr)]">
          <div className="flex min-h-0 min-w-0 flex-col">
            {packBar ? <div className="mb-3">{packBar}</div> : null}

            {/* Inset the scroll box so card rings and focus outlines are not cut at the edges;
                the negative margin keeps the cards aligned with the page grid. */}
            <div
              ref={listRef}
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
                    {visible.slice(0, visibleWindow).map((proposal, index) => {
                      const busy = pendingIds.has(proposal.id);
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
                          <InboxRow
                            proposal={proposal}
                            selected={index === selected}
                            busy={busy}
                            checked={picked.has(proposal.id)}
                            selectable
                            selectionMode={selectionActive}
                            selectLabel={t("inbox.selectProposal", { title: proposal.title || proposal.id })}
                            onSelectPointerDown={(shiftKey) => {
                              shiftPick.current = shiftKey;
                            }}
                            onCheckedChange={() => togglePick(proposal.id, shiftPick.current)}
                            onOpen={() => open(proposal.id)}
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
            className="hidden min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-muted/25 min-[1280px]:flex"
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
                busy={pendingIds.has(current.id)}
                armed={armed === current.id}
                editButtonRef={editButtonRef}
                onApprove={() => approveCurrent(current.id)}
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
          pending={false}
          onSubmit={(data, body) => {
            if (!current) return;
            const id = current.id;
            const restore = advanceSelection(id);
            queueApprove({
              id,
              title: titleOf(current),
              override: { data, body },
              callbacks: { onUndo: restore, onError: restore },
            });
            setEditOpen(false);
            setErrors({});
          }}
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
              disabled={queueBusy}
              onClick={() => {
                setApproveAllOpen(false);
                approveAllNow("header");
              }}
            >
              {t("inbox.approveAll")}
            </Button>
          </div>
        </CenterMorphModalContent>
      </CenterMorphModal>

      <CenterMorphModal open={rejectOpen !== null} onOpenChange={(open) => setRejectOpen(open ? rejectOpen : null)}>
        <CenterMorphModalContent
          ariaLabel={t("inbox.rejectAllTitle")}
          ariaDescribedBy="inbox-reject-prompt"
          closeButtonLabel={t("proposal.cancel")}
          showCloseButton={false}
          className="max-w-md p-6"
        >
          <h2 className="text-base font-semibold tracking-tight">{t("inbox.rejectAllTitle")}</h2>
          <p id="inbox-reject-prompt" className="mt-2 text-sm leading-6 text-muted-foreground">
            {t("inbox.rejectAllPrompt", { count: rejectCount })}
          </p>
          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" pressScale={0.97} onClick={() => setRejectOpen(null)}>
              {t("proposal.cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              pressScale={0.97}
              disabled={queueBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmReject}
            >
              {rejectOpen === "selection" ? t("inbox.rejectSelected") : t("inbox.rejectAll")}
            </Button>
          </div>
        </CenterMorphModalContent>
      </CenterMorphModal>
    </Page>
  );
}
