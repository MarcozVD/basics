import type { NoteData, NoteType, ProposalDetail as Proposal } from "@marcozvd/basics-core";
import { Check, Pencil, X } from "lucide-react";
import { type Ref, useEffect, useState } from "react";
import { DiffView } from "@/components/diff-view";
import { AnimatedBadge } from "@/components/motion/animated-badge";
import { Button } from "@/components/motion/button/base";
import { CenterMorphModal, CenterMorphModalContent } from "@/components/motion/center-morph-modal";
import { NoteForm } from "@/components/note-form/note-form";
import { Textarea } from "@/components/ui/textarea";
import { type TranslationKey, useI18n } from "@/i18n";
import { agentColor, agentInitial } from "@/lib/agent-color";
import { formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

/** Turn an API validation error into field-level messages for the edit modal. */
export function issuesToErrors(issues: unknown): Record<string, string> {
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
    <AnimatedBadge
      status={action === "create" ? "info" : "neutral"}
      size="sm"
      showIcon={false}
      className={cn(
        "border-transparent font-medium",
        action === "create" ? "border-primary/30 bg-primary/10 text-primary-text" : "border-border bg-muted/60 text-muted-foreground",
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

function Kbd({ children }: { children: string }) {
  return (
    <kbd className="hidden rounded-full border border-current/30 px-1.5 font-mono text-[10px] leading-4 text-current sm:inline-block">
      {children}
    </kbd>
  );
}

interface ProposalDetailProps {
  proposal: Proposal;
  busy: boolean;
  armed: boolean;
  variant?: "page" | "panel";
  editButtonRef?: Ref<HTMLButtonElement>;
  className?: string;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}

/**
 * Reason, diff and actions for one proposal. `page` keeps the floating action
 * bar used by `/inbox/:id`; `panel` fills the Inbox master-detail column and
 * keeps its actions in a footer.
 */
export function ProposalDetail({
  proposal,
  busy,
  armed,
  variant = "page",
  editButtonRef,
  className,
  onApprove,
  onReject,
  onEdit,
}: ProposalDetailProps) {
  const { t, language } = useI18n();
  const panel = variant === "panel";
  const title = proposal.data.title ?? proposal.id;
  const name = proposal.meta.proposed_by;

  const actions = (
    <>
      <Button
        variant="ghost"
        size="sm"
        pressScale={0.97}
        disabled={busy}
        onClick={onReject}
        aria-label={armed ? t("proposal.rejectConfirm") : t("proposal.reject")}
        className="gap-1.5 whitespace-nowrap"
      >
        <X className="size-3.5" aria-hidden="true" />
        <span className={cn(armed && "text-destructive-text")}>{armed ? t("proposal.rejectConfirm") : t("proposal.reject")}</span>
        <Kbd>r</Kbd>
      </Button>
      <Button
        variant="secondary"
        size="sm"
        pressScale={0.97}
        disabled={busy}
        ref={editButtonRef}
        onClick={onEdit}
        aria-label={t("proposal.edit")}
        className="gap-1.5 whitespace-nowrap"
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
        onClick={onApprove}
        aria-label={t("proposal.approve")}
        className="gap-1.5 whitespace-nowrap"
      >
        <Check className="size-3.5" aria-hidden="true" />
        {t("proposal.approve")}
        <Kbd>a</Kbd>
      </Button>
    </>
  );

  return (
    <div data-proposal-detail={proposal.id} className={cn("flex min-h-0 flex-col", panel && "h-full", className)}>
      <header className={cn(panel && "px-4 pt-4")}>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <ActionBadge action={proposal.meta.action} />
          <TypeChip type={proposal.data.type} />
          {panel ? (
            <h2 className="min-w-0 text-base font-semibold tracking-tight">{title}</h2>
          ) : (
            <h1 className="min-w-0 truncate text-xl font-semibold tracking-tight">{title}</h1>
          )}
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

        <blockquote
          className={cn(
            "mt-3 border-l-2 border-foreground/15 pl-3 text-sm italic whitespace-pre-wrap text-muted-foreground",
            !panel && "max-w-3xl",
          )}
        >
          {proposal.meta.reason}
        </blockquote>
      </header>

      <div className={panel ? "mt-3 min-h-0 flex-1 px-4 pb-2" : "mt-4 h-[calc(100dvh-21rem)] min-h-[320px]"}>
        <DiffView before={proposal.current?.text ?? null} after={proposal.proposedText} file={proposal.id} />
      </div>

      <div
        role="toolbar"
        aria-label={t("proposal.actions")}
        className={cn(
          "flex items-center gap-1",
          panel
            ? "shrink-0 justify-end border-t border-border px-3 py-2"
            : "fixed bottom-[82px] left-1/2 z-40 max-w-[calc(100vw-1rem)] -translate-x-1/2 overflow-x-auto rounded-full border border-border bg-card/80 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.25)] backdrop-blur-xl [scrollbar-width:none]",
        )}
      >
        {actions}
      </div>
    </div>
  );
}

interface ProposalEditModalProps {
  proposal: Proposal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  errors: Record<string, string>;
  pending: boolean;
  onSubmit: (data: NoteData, body: string) => void;
}

/** Edit frontmatter and body, then approve the proposal in one step. */
export function ProposalEditModal({ proposal, open, onOpenChange, errors, pending, onSubmit }: ProposalEditModalProps) {
  const { t } = useI18n();
  const [data, setData] = useState<NoteData | null>(null);
  const [body, setBody] = useState("");

  useEffect(() => {
    if (!open) return;
    setData(proposal.data);
    setBody(proposal.body);
  }, [open, proposal]);

  return (
    <CenterMorphModal open={open} onOpenChange={onOpenChange}>
      <CenterMorphModalContent
        ariaLabel={t("proposal.edit.title")}
        closeButtonLabel={t("proposal.cancel")}
        className="max-h-[86dvh] max-w-[900px] overflow-y-auto p-6"
      >
        <h2 className="text-base font-semibold tracking-tight">{t("proposal.edit.title")}</h2>
        <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{proposal.id}</p>

        {data ? (
          <div className="mt-4 flex flex-col gap-3">
            <NoteForm type={data.type} data={data} errors={errors} onChange={setData} />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="proposal-body" className="text-xs text-muted-foreground">
                {t("editor.body")}
              </label>
              <Textarea
                id="proposal-body"
                value={body}
                aria-invalid={Boolean(errors.body)}
                aria-describedby={errors.body ? "proposal-body-error" : undefined}
                className="min-h-40 rounded-xl font-mono text-[13px]"
                onChange={(event) => setBody(event.target.value)}
              />
              {errors.body ? (
                <p id="proposal-body-error" className="text-xs text-destructive-text">
                  {errors.body}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" pressScale={0.97} onClick={() => onOpenChange(false)}>
            {t("proposal.cancel")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            pressScale={0.97}
            disabled={pending || !data}
            onClick={() => {
              if (data) onSubmit(data, body);
            }}
          >
            {t("proposal.approve")}
          </Button>
        </div>
      </CenterMorphModalContent>
    </CenterMorphModal>
  );
}
