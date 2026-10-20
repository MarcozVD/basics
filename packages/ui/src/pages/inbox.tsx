import type { ProposalSummary } from "@marcozvd/basics-core";
import { Inbox as InboxIcon } from "lucide-react";
import { useNavigate } from "react-router";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { useInbox } from "@/lib/queries";
import { formatRelativeTime } from "@/lib/relative-time";

function createdTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function ActionBadge({ action }: { action: ProposalSummary["meta"]["action"] }) {
  const { t } = useI18n();
  return (
    <Badge
      variant={action === "create" ? "outline" : "secondary"}
      className={action === "create" ? "border-primary/50 text-primary" : undefined}
    >
      {t(action === "create" ? "proposal.action.create" : "proposal.action.update")}
    </Badge>
  );
}

export function InboxPage() {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const inbox = useInbox();
  const proposals = [...(inbox.data ?? [])].sort((a, b) => createdTime(b.meta.created) - createdTime(a.meta.created));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b px-4 py-3">
        <h1 className="text-base font-semibold">{t("page.inbox.title")}</h1>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {inbox.isPending ? (
          <div className="p-4 text-sm text-muted-foreground">{t("state.loading")}</div>
        ) : inbox.error ? (
          <div className="p-4 text-sm text-destructive">{inbox.error.message}</div>
        ) : proposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-4 py-16 text-center">
            <InboxIcon className="size-5 text-muted-foreground" aria-hidden="true" />
            <p className="max-w-md text-sm text-muted-foreground">{t("inbox.empty")}</p>
          </div>
        ) : (
          <div>
            {proposals.map((proposal) => (
              <button
                key={proposal.id}
                type="button"
                onClick={() => navigate(`/inbox/${encodeURIComponent(proposal.id)}`)}
                className="flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <ActionBadge action={proposal.meta.action} />
                    <span className="truncate text-sm font-medium">{proposal.title || proposal.id}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{proposal.id}</span>
                  </div>
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{t(`type.${proposal.type}`)}</Badge>
                    <span className="shrink-0">{t("inbox.by", { name: proposal.meta.proposed_by })}</span>
                    <span className="min-w-0 flex-1 truncate" title={proposal.meta.reason}>
                      {proposal.meta.reason}
                    </span>
                  </div>
                </div>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={proposal.meta.created} title={proposal.meta.created}>
                  {formatRelativeTime(proposal.meta.created, language)}
                </time>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
