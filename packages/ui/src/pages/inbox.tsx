import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Inbox as InboxIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ApprovalCard } from "@/components/agents/approval-card";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { ErrorState, Loading } from "@/components/state";
import { type TranslationKey, useI18n } from "@/i18n";
import { agentColor, agentInitial } from "@/lib/agent-color";
import { ApiRequestError, approveProposal, rejectProposal } from "@/lib/api";
import { EASE_OUT, SPRING_LAYOUT } from "@/lib/ease";
import { useInbox } from "@/lib/queries";
import { formatRelativeTime } from "@/lib/relative-time";
import { toast } from "@/lib/toast";

type Filter = "all" | "create" | "update";

const README_PROPOSE = "https://github.com/MarcozVD/basics#conectar-agentes-mcp";

function createdTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

export function InboxPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const reduce = useReducedMotion() ?? false;
  const queryClient = useQueryClient();
  const inbox = useInbox();
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState(0);
  const [armed, setArmed] = useState<string | null>(null);
  const armTimer = useRef<number | undefined>(undefined);

  const proposals = useMemo(
    () => [...(inbox.data ?? [])].sort((a, b) => createdTime(b.meta.created) - createdTime(a.meta.created)),
    [inbox.data],
  );

  const counts = useMemo(() => {
    const create = proposals.filter((proposal) => proposal.meta.action === "create").length;
    return { all: proposals.length, create, update: proposals.length - create };
  }, [proposals]);

  const visible = useMemo(
    () => (filter === "all" ? proposals : proposals.filter((proposal) => proposal.meta.action === filter)),
    [filter, proposals],
  );

  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, visible.length - 1)));
  }, [visible.length]);

  useEffect(() => {
    document.getElementById(`proposal-card-${selected}`)?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => () => window.clearTimeout(armTimer.current), []);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
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

  const open = (id: string) => navigate(`/inbox/${encodeURIComponent(id)}`);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const current = visible[selected];
      if (!current) return;
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
        open(current.id);
      } else if (event.key.toLowerCase() === "a") {
        if (approve.isPending || reject.isPending) return;
        event.preventDefault();
        approve.mutate(current.id);
      } else if (event.key.toLowerCase() === "r") {
        if (approve.isPending || reject.isPending) return;
        event.preventDefault();
        requestReject(current.id);
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

  return (
    <div className="mx-auto w-full max-w-[860px] px-5 pt-4 pb-8 min-[1400px]:max-w-[1200px]">
      <span className="sr-only">{t("inbox.shortcuts")}</span>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{t("page.inbox.title")}</h1>
          <span className="inline-flex items-baseline gap-1.5 text-xs text-muted-foreground">
            <AnimatedNumber value={proposals.length} startOnView={false} duration={0.5} className="text-sm font-medium text-foreground" />
            {t("inbox.pending")}
          </span>
        </div>

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
      </header>

      {inbox.isPending ? (
        <div className="py-10">
          <Loading />
        </div>
      ) : inbox.error ? (
        <div className="py-10">
          <ErrorState error={inbox.error} />
        </div>
      ) : visible.length === 0 ? (
        proposals.length === 0 ? (
          <div className="flex min-h-[calc(100dvh-12rem)] flex-col items-center justify-center gap-2 px-4 text-center">
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
        ) : (
          <div className="flex min-h-[calc(100dvh-14rem)] flex-col items-center justify-center gap-1 px-4 text-center">
            <p className="text-sm font-medium">{t("state.empty.title")}</p>
            <p className="text-xs text-muted-foreground">{t("state.empty.description")}</p>
          </div>
        )
      ) : (
        <div className="mt-4 grid gap-3 min-[1400px]:grid-cols-2">
          <AnimatePresence initial mode="popLayout">
            {visible.map((proposal, index) => {
              const busy =
                (approve.isPending && approve.variables === proposal.id) || (reject.isPending && reject.variables === proposal.id);
              const typeLabel = t(`type.${proposal.type}` as TranslationKey);
              const name = proposal.meta.proposed_by;
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
                  onMouseEnter={() => setSelected(index)}
                  className="min-w-0"
                >
                  <ApprovalCard
                    title={proposal.title || proposal.id}
                    subtitle={proposal.id}
                    actionLabel={t(proposal.meta.action === "create" ? "proposal.action.create" : "proposal.action.update")}
                    action={proposal.meta.action}
                    typeLabel={typeLabel}
                    typeColor={`var(--type-${proposal.type})`}
                    agentName={t("inbox.by", { name })}
                    agentInitial={agentInitial(name)}
                    agentColor={agentColor(name)}
                    agentForeground="#111113"
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
  );
}
