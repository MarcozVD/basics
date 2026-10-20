import type { ActivityEvent, NoteType, ProposalSummary } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Copy } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ApprovalCard } from "@/components/agents/approval-card";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { MorphPopover, MorphPopoverContent, MorphPopoverTrigger } from "@/components/motion/popover-morph";
import { TextReveal } from "@/components/motion/text-reveal";
import { ErrorState, Loading } from "@/components/state";
import { type TranslationKey, useI18n } from "@/i18n";
import { agentColor, agentInitial } from "@/lib/agent-color";
import { ApiRequestError, approveProposal, rejectProposal } from "@/lib/api";
import { SPRING_LAYOUT } from "@/lib/ease";
import { useActivity, useInbox, useNotes, useStats } from "@/lib/queries";
import { formatCompactRelativeTime, formatFullDateTime, formatRelativeTime } from "@/lib/relative-time";
import { toast } from "@/lib/toast";
import { tintStyle, typeColor } from "@/lib/type-color";

const TYPE_ORDER: NoteType[] = ["tech", "practice", "check", "profile", "project", "layer"];
const REVEAL_KEY = "basics-home-revealed";

// Tools whose activity has a localized verb; anything else falls back to its raw name.
const verbKeys: Partial<Record<string, TranslationKey>> = {
  get_note: "home.verb.get_note",
  search_vault: "home.verb.search_vault",
  recommend_stack: "home.verb.recommend_stack",
  get_stack_context: "home.verb.get_stack_context",
  propose_note: "home.verb.propose_note",
  list_layers: "home.verb.list_layers",
  list_proposals: "home.verb.list_proposals",
};

interface ActivityGroup {
  key: string;
  event: ActivityEvent;
  /** Timestamp of the most recent event merged into the group. */
  lastTs: string;
  count: number;
  noteIds: string[];
  detail?: string;
}

function isToday(value: string): boolean {
  const date = new Date(value);
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

/** Consecutive events merge while they stay within this window. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** Merge consecutive events from the same agent and tool so reads collapse into one row. */
function groupActivity(events: ActivityEvent[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  for (const event of events) {
    const previous = groups[groups.length - 1];
    const gap = previous ? Math.abs(Date.parse(previous.lastTs) - Date.parse(event.ts)) : Number.POSITIVE_INFINITY;
    if (previous && previous.event.agent === event.agent && previous.event.tool === event.tool && gap <= GROUP_WINDOW_MS) {
      previous.count += 1;
      previous.lastTs = event.ts;
      previous.noteIds = [...new Set([...previous.noteIds, ...event.noteIds])];
      if (previous.detail !== event.detail) previous.detail = undefined;
      continue;
    }
    groups.push({
      key: `${event.ts}-${event.agent}-${event.tool}-${groups.length}`,
      event,
      lastTs: event.ts,
      count: 1,
      noteIds: event.noteIds,
      detail: event.detail,
    });
  }
  return groups;
}

function useRevealOnce(): boolean {
  const [reveal] = useState(() => {
    try {
      return sessionStorage.getItem(REVEAL_KEY) !== "1";
    } catch {
      return true;
    }
  });
  useEffect(() => {
    if (!reveal) return;
    try {
      sessionStorage.setItem(REVEAL_KEY, "1");
    } catch {
      // Private mode: animating every mount is acceptable.
    }
  }, [reveal]);
  return reveal;
}

function SectionLabel({ children }: { children: string }) {
  return <h2 className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{children}</h2>;
}

function TypeChip({ id, type }: { id: string; type: NoteType | undefined }) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate(`/notes/${encodeURIComponent(id)}`)}
      className="inline-flex h-5 max-w-48 min-w-0 items-center rounded-full px-2 font-mono text-[10px] transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      style={tintStyle(typeColor(type))}
    >
      <span className="truncate">{id}</span>
    </button>
  );
}

interface TileProps {
  label: string;
  value: number;
  stat: string;
  /** Note-type color for the leading dot. */
  dot?: string;
  alert?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}

/** Compact stat tile; turns into a popover trigger when it has details to show. */
function StatTile({ label, value, stat, dot, alert, onClick, children }: TileProps) {
  const { t } = useI18n();
  const body = (
    <>
      <span className="flex min-w-0 max-w-full items-center gap-1.5 text-[11px] text-muted-foreground">
        {dot ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} /> : null}
        <span className="truncate">{label}</span>
      </span>
      <AnimatedNumber
        value={value}
        startOnView={false}
        duration={0.5}
        className={`text-sm font-semibold ${alert ? "text-destructive-text" : "text-foreground"}`}
      />
    </>
  );

  const className = `flex w-full min-w-0 flex-col items-start gap-0.5 rounded-xl border border-border bg-card/60 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`;

  if (children === undefined || value === 0) {
    return onClick ? (
      <button type="button" data-stat={stat} onClick={onClick} className={className}>
        {body}
      </button>
    ) : (
      <div data-stat={stat} className={className}>
        {body}
      </div>
    );
  }

  // The popover wraps its trigger in its own element; stretch that wrapper to fill the grid cell.
  return (
    <div className="min-w-0 *:w-full">
      <MorphPopover>
        <MorphPopoverTrigger>
          <button type="button" data-stat={stat} aria-label={`${label}: ${value} — ${t("home.showDetails")}`} className={className}>
            {body}
          </button>
        </MorphPopoverTrigger>
        <MorphPopoverContent side="top" align="start" className="w-80 p-2">
          {children}
        </MorphPopoverContent>
      </MorphPopover>
    </div>
  );
}

export function HomePage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reduce = useReducedMotion() ?? false;
  const reveal = useRevealOnce();

  const stats = useStats();
  const inbox = useInbox();
  const notes = useNotes();
  const timeline = useActivity({ limit: 20 });
  const dayActivity = useActivity({ limit: 200 });

  const [armed, setArmed] = useState<string | null>(null);
  const armTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(armTimer.current), []);

  const typeById = useMemo(() => new Map((notes.data ?? []).map((note) => [note.id, note.type])), [notes.data]);

  const proposals = useMemo<ProposalSummary[]>(
    () => [...(inbox.data ?? [])].sort((a, b) => Date.parse(b.meta.created) - Date.parse(a.meta.created)).slice(0, 4),
    [inbox.data],
  );

  const groups = useMemo(() => groupActivity(timeline.data ?? []), [timeline.data]);

  const agentsToday = useMemo(
    () => new Set((dayActivity.data ?? []).filter((event) => isToday(event.ts)).map((event) => event.agent)).size,
    [dayActivity.data],
  );

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
        onClick: () => navigate(`/notes/${encodeURIComponent(note.id)}`),
      });
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 404) {
        invalidate();
        toast.error(t("proposal.gone"));
        return;
      }
      toast.error(t("inbox.approveFailed"));
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

  const requestReject = (id: string) => {
    if (armed === id) {
      window.clearTimeout(armTimer.current);
      setArmed(null);
      reject.mutate(id);
      return;
    }
    window.clearTimeout(armTimer.current);
    setArmed(id);
    armTimer.current = window.setTimeout(() => setArmed(null), 3000);
  };

  const copyMcp = async () => {
    try {
      await navigator.clipboard.writeText(`claude mcp add --transport http basics ${window.location.origin}/mcp`);
      toast.success(t("palette.copied"));
    } catch {
      toast.error(t("palette.copyFailed"));
    }
  };

  const verbFor = (group: ActivityGroup): string => {
    const { tool } = group.event;
    if (tool === "get_note" && group.count > 1) return t("home.verb.readCount", { count: group.count });
    const key = `home.verb.${tool}` as TranslationKey;
    return t(verbKeys[tool] ? key : "home.verb.other");
  };

  const counts = stats.data?.counts;
  const total = stats.data?.total ?? 0;
  const pending = stats.data?.inbox ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-5 pt-4 pb-8">
      <header>
        {reveal ? (
          <TextReveal
            as="h1"
            text={t("home.title")}
            className="text-xl font-semibold tracking-tight"
            stagger={0.06}
            blur={8}
            yOffset="30%"
          />
        ) : (
          <h1 className="text-xl font-semibold tracking-tight">{t("home.title")}</h1>
        )}
        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
          {t("home.summary", { total, inbox: pending, agents: agentsToday })}
        </p>
      </header>

      <div className="mt-5 grid gap-6 min-[1200px]:grid-cols-[3fr_2fr]">
        <section aria-label={t("home.waiting")} className="min-w-0">
          <div className="flex items-baseline justify-between gap-3">
            <SectionLabel>{t("home.waiting")}</SectionLabel>
            <Link
              to="/inbox"
              className="inline-flex items-center gap-1 rounded-sm text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("home.allProposals")}
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </div>

          <div className="mt-2 flex flex-col gap-2">
            {inbox.isPending ? (
              <Loading />
            ) : inbox.error ? (
              <ErrorState error={inbox.error} />
            ) : proposals.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("home.nothingToReview")}</p>
            ) : (
              <AnimatePresence initial={false} mode="popLayout">
                {proposals.map((proposal) => {
                  const busy =
                    (approve.isPending && approve.variables === proposal.id) || (reject.isPending && reject.variables === proposal.id);
                  return (
                    <motion.div
                      key={proposal.id}
                      layout={!reduce}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                      transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
                    >
                      <ApprovalCard
                        title={proposal.title || proposal.id}
                        subtitle={proposal.id}
                        actionLabel={t(proposal.meta.action === "create" ? "proposal.action.create" : "proposal.action.update")}
                        action={proposal.meta.action}
                        typeLabel={t(`type.${proposal.type}` as TranslationKey)}
                        typeColor={`var(--type-${proposal.type})`}
                        agentName={t("inbox.by", { name: proposal.meta.proposed_by })}
                        agentInitial={agentInitial(proposal.meta.proposed_by)}
                        agentColor={agentColor(proposal.meta.proposed_by)}
                        agentForeground="#111113"
                        reason={proposal.meta.reason}
                        time={
                          <time dateTime={proposal.meta.created} title={proposal.meta.created}>
                            {formatRelativeTime(proposal.meta.created, language)}
                          </time>
                        }
                        status={busy ? "submitting" : "pending"}
                        busy={busy}
                        approveLabel={t("proposal.approve")}
                        rejectLabel={t("proposal.reject")}
                        rejectConfirmLabel={t("proposal.rejectConfirm")}
                        rejectArmed={armed === proposal.id}
                        onOpen={() => navigate(`/inbox/${encodeURIComponent(proposal.id)}`)}
                        onApprove={() => approve.mutate(proposal.id)}
                        onReject={() => requestReject(proposal.id)}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
        </section>

        <section aria-label={t("home.activity")} className="min-w-0">
          <SectionLabel>{t("home.activity")}</SectionLabel>

          {timeline.isPending ? (
            <div className="mt-2">
              <Loading />
            </div>
          ) : timeline.error ? (
            <div className="mt-2">
              <ErrorState error={timeline.error} />
            </div>
          ) : groups.length === 0 ? (
            <div className="mt-2">
              <p className="text-sm text-muted-foreground">{t("home.noAgents")}</p>
              <div className="mt-2 flex items-start gap-1.5">
                <code className="min-w-0 rounded-md bg-muted/70 px-2 py-1 font-mono text-[10.5px] leading-4 break-all text-muted-foreground">
                  claude mcp add --transport http basics {window.location.origin}/mcp
                </code>
                <button
                  type="button"
                  aria-label={t("home.copy")}
                  title={t("home.copy")}
                  onClick={() => void copyMcp()}
                  className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <Copy className="size-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : (
            <ul className="mt-1 flex flex-col">
              <AnimatePresence initial={false}>
                {groups.map((group) => (
                  <motion.li
                    key={group.key}
                    layout={!reduce}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0 }}
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 34 }}
                    className="flex items-start gap-2 border-b border-border/50 py-1.5 last:border-0"
                  >
                    <time
                      className="w-10 shrink-0 pt-0.5 text-right font-mono text-[10px] whitespace-nowrap text-muted-foreground"
                      dateTime={group.event.ts}
                      title={formatFullDateTime(group.event.ts, language)}
                    >
                      {formatCompactRelativeTime(group.event.ts)}
                    </time>
                    <span
                      aria-hidden="true"
                      className="mt-0.5 grid size-[18px] shrink-0 place-items-center rounded-md font-mono text-[10px] font-semibold text-[#111113]"
                      style={{ backgroundColor: agentColor(group.event.agent) }}
                    >
                      {agentInitial(group.event.agent)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-xs">
                        <span className="font-medium">{group.event.agent}</span>
                        <span className="text-muted-foreground">{verbFor(group)}</span>
                        {group.count > 1 && group.event.tool !== "get_note" ? (
                          <span className="font-mono text-[11px] text-muted-foreground">×{group.count}</span>
                        ) : null}
                        {group.event.tool === "search_vault" && group.detail ? (
                          <span className="font-mono text-[11px] text-muted-foreground">“{group.detail}”</span>
                        ) : null}
                      </div>
                      {group.noteIds.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {group.noteIds.slice(0, 6).map((id) => (
                            <TypeChip key={id} id={id} type={typeById.get(id)} />
                          ))}
                          {group.noteIds.length > 6 ? (
                            <span className="self-center font-mono text-[10px] text-muted-foreground">+{group.noteIds.length - 6}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </section>
      </div>

      <section aria-label={t("home.health")} className="mt-7 min-w-0">
        <SectionLabel>{t("home.health")}</SectionLabel>
        {stats.error ? (
          <div className="mt-2">
            <ErrorState error={stats.error} />
          </div>
        ) : null}
        <div className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
          {TYPE_ORDER.map((type) => (
            <StatTile
              key={type}
              stat={type}
              label={t(`type.${type}` as TranslationKey)}
              dot={`var(--type-${type})`}
              value={counts?.[type] ?? 0}
              onClick={() => navigate(`/explore?type=${type}`)}
            />
          ))}

          <StatTile
            stat="broken"
            label={t("home.brokenLinks")}
            value={stats.data?.brokenLinks.length ?? 0}
            alert={(stats.data?.brokenLinks.length ?? 0) > 0}
          >
            <ul className="flex flex-col gap-1 p-1">
              {(stats.data?.brokenLinks ?? []).map((link) => (
                <li key={`${link.from}-${link.to}`} className="truncate font-mono text-[11px] text-muted-foreground">
                  {link.from} <span className="text-foreground/50">→</span> {link.to}
                </li>
              ))}
            </ul>
          </StatTile>

          <StatTile stat="orphans" label={t("home.orphans")} value={stats.data?.orphans.length ?? 0}>
            <ul className="flex flex-col gap-0.5 p-1">
              {(stats.data?.orphans ?? []).map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/notes/${encodeURIComponent(id)}`)}
                    className="w-full truncate rounded-md px-1.5 py-1 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    {id}
                  </button>
                </li>
              ))}
            </ul>
          </StatTile>

          <StatTile stat="recent" label={t("home.recent")} value={stats.data?.recent.length ?? 0}>
            <ul className="flex flex-col gap-0.5 p-1">
              {(stats.data?.recent ?? []).map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/notes/${encodeURIComponent(note.id)}`)}
                    className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs">{note.title || note.id}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{note.updated}</span>
                  </button>
                </li>
              ))}
            </ul>
          </StatTile>
        </div>
      </section>
    </div>
  );
}
