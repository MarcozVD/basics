"use client";
// beui.dev/components/agents/approval-card (adapted for Basics proposal cards)

import { Check, LoaderCircle, MessageSquareText, Package, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Button } from "@/components/motion/button/base";
import { SPRING_LAYOUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

export type ApprovalCardStatus = "pending" | "submitting" | "approved" | "rejected";

export interface ApprovalCardProps {
  title: ReactNode;
  subtitle?: ReactNode;
  actionLabel: ReactNode;
  action: "create" | "update";
  typeLabel: string;
  typeColor: string;
  agentName: string;
  agentInitial: string;
  agentColor: string;
  agentForeground: string;
  /** Packs get a neutral package glyph instead of the proposal author's letter. */
  agentKind?: "agent" | "pack";
  reason: string;
  time: ReactNode;
  status?: ApprovalCardStatus;
  selected?: boolean;
  busy?: boolean;
  approveLabel: ReactNode;
  rejectLabel: ReactNode;
  rejectConfirmLabel: ReactNode;
  rejectArmed?: boolean;
  onOpen?: () => void;
  onApprove?: () => void;
  onReject?: () => void;
  className?: string;
}

const STATUS_CLASS: Record<ApprovalCardStatus, string> = {
  pending: "text-muted-foreground",
  submitting: "text-primary",
  approved: "text-emerald-600 dark:text-emerald-400",
  rejected: "text-destructive",
};

function StatusIcon({ status, busy }: { status: ApprovalCardStatus; busy: boolean }) {
  const reduce = useReducedMotion() ?? false;
  if (busy || status === "submitting") {
    return <LoaderCircle className={cn("size-4", !reduce && "animate-spin")} />;
  }
  if (status === "rejected") return <X className="size-4" />;
  if (status === "approved") return <Check className="size-4" />;
  return <MessageSquareText className="size-4" />;
}

export function ApprovalCard({
  title,
  subtitle,
  actionLabel,
  action,
  typeLabel,
  typeColor,
  agentName,
  agentInitial,
  agentColor,
  agentForeground,
  agentKind = "agent",
  reason,
  time,
  status = "pending",
  selected = false,
  busy = false,
  approveLabel,
  rejectLabel,
  rejectConfirmLabel,
  rejectArmed = false,
  onOpen,
  onApprove,
  onReject,
  className,
}: ApprovalCardProps) {
  const reduce = useReducedMotion() ?? false;

  return (
    <motion.div
      layout={!reduce}
      data-state={status}
      aria-busy={busy}
      transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
      className={cn("group/card relative rounded-2xl bg-card ring-1 ring-border/70 transition-colors", className)}
    >
      {selected ? (
        <motion.span
          layoutId="inbox-focus-ring"
          transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
          className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-ring"
          aria-hidden="true"
        />
      ) : null}

      <button
        type="button"
        data-proposal-open
        onClick={onOpen}
        className="flex w-full min-w-0 flex-col gap-2 rounded-2xl p-3.5 text-left outline-none"
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("grid size-5 shrink-0 place-items-center", STATUS_CLASS[status])}>
            <StatusIcon status={status} busy={busy} />
          </span>
          <AnimatedBadge
            status={action === "create" ? "info" : "neutral"}
            size="sm"
            showIcon={false}
            className={cn(
              "border-transparent font-medium",
              action === "create" ? "border-primary/30 bg-primary/10 text-primary-text" : "border-border bg-muted/60 text-muted-foreground",
            )}
          >
            {actionLabel}
          </AnimatedBadge>
          <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2 text-[11px] text-muted-foreground">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full ring-1 ring-black/10 dark:ring-white/20"
              style={{ backgroundColor: typeColor }}
            />
            {typeLabel}
          </span>
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{time}</span>
        </div>

        <div className="flex min-w-0 items-baseline gap-2">
          <h3 className="min-w-0 truncate text-sm font-medium">{title}</h3>
          {subtitle ? <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{subtitle}</span> : null}
        </div>

        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              "grid size-[18px] shrink-0 place-items-center rounded-md font-mono text-[10px] font-semibold",
              agentKind === "pack" && "bg-muted text-muted-foreground ring-1 ring-border",
            )}
            style={agentKind === "pack" ? undefined : { backgroundColor: agentColor, color: agentForeground }}
          >
            {agentKind === "pack" ? <Package className="size-3" /> : agentInitial}
          </span>
          <span className="min-w-0 truncate">{agentName}</span>
        </div>

        <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">{reason}</p>
      </button>

      <div className="flex items-center justify-end gap-1.5 px-3 pb-3">
        <Button
          variant="ghost"
          size="sm"
          pressScale={0.97}
          disabled={busy}
          onClick={onReject}
          className={cn("h-7 px-2.5", rejectArmed && "text-destructive hover:text-destructive")}
        >
          {rejectArmed ? rejectConfirmLabel : rejectLabel}
        </Button>
        <Button variant="primary" size="sm" pressScale={0.97} disabled={busy} onClick={onApprove} className="h-7 px-3">
          {approveLabel}
        </Button>
      </div>
    </motion.div>
  );
}
