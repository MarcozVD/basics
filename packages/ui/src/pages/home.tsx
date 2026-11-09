import type { ActivityEvent, PackInfo, ProposalSummary } from "@marcozvd/basics-core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CircleDashed, Copy, GitFork, Inbox, Link2Off, Package, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ApprovalCard } from "@/components/agents/approval-card";
import { Button } from "@/components/motion/button/base";
import { Checkbox } from "@/components/motion/checkbox";
import { Loader } from "@/components/motion/loader";
import { MorphPopover, MorphPopoverContent, MorphPopoverTrigger } from "@/components/motion/popover-morph";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { PAGE_SECTIONS, Page } from "@/components/page";
import { PageHeader } from "@/components/page-header";
import { ErrorState, Loading } from "@/components/state";
import { type TranslationKey, useI18n } from "@/i18n";
import { agentColor, agentInitial } from "@/lib/agent-color";
import { ApiRequestError, addPack, installPack, type Language, rejectProposal } from "@/lib/api";
import { SPRING_LAYOUT } from "@/lib/ease";
import { useIntentNavigate } from "@/lib/intent-navigate";
import { useIntro } from "@/lib/intro";
import { packProposer } from "@/lib/packs";
import { useDocumentTitle } from "@/lib/page-title";
import { useActivity, useConnectStatus, useInbox, useNotes, usePacks, useStats } from "@/lib/queries";
import { type RecentItem, readRecentItems } from "@/lib/recent-notes";
import { formatCompactRelativeTime, formatFullDateTime, formatRelativeTime } from "@/lib/relative-time";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const SETUP_KEY = "basics:setup-dismissed";
const CONTINUE_ROWS = 5;
const ACTIVITY_ROWS = 3;
/** Loading skeletons reserve their rows so late data does not move the page. */
const CONTINUE_ROW_HEIGHT = 44;
const ACTIVITY_ROW_HEIGHT = 32;

const POPOVER_ACTION =
  "shrink-0 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring";

const HEALTH_LINK =
  "rounded-sm underline decoration-border/60 underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

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

function SectionLabel({ children, id }: { children: string; id?: string }) {
  return (
    <h2 id={id} className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </h2>
  );
}

interface StarterPacksProps {
  packs: PackInfo[] | undefined;
  pending: boolean;
  error: Error | null;
  language: Language;
  packLanguage: Language;
  selected: Set<string>;
  installing: boolean;
  /** Pack ids that currently have proposals pending in the inbox. */
  pendingPacks: Set<string>;
  onToggle: (name: string) => void;
  onLanguageChange: (language: Language) => void;
  onInstall: () => void;
}

function packDescription(pack: PackInfo, language: Language): string {
  return pack.description[language] || pack.description.en || Object.values(pack.description)[0] || "";
}

/** First-run empty state: install the official note packs in one step. */
function StarterPacks({
  packs,
  pending,
  error,
  language,
  packLanguage,
  selected,
  installing,
  pendingPacks,
  onToggle,
  onLanguageChange,
  onInstall,
}: StarterPacksProps) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [repoInput, setRepoInput] = useState("");
  const [added, setAdded] = useState<import("@marcozvd/basics-core").PackAddResult | null>(null);

  const add = useMutation({
    mutationFn: (repo: string) => addPack({ repo, lang: language }),
    onSuccess: (result) => {
      setAdded(result);
      setRepoInput("");
      void queryClient.invalidateQueries({ queryKey: ["packs"] });
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
      void queryClient.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const addError = add.error ? (add.error instanceof ApiRequestError ? add.error.body : (add.error as Error)) : null;
  const canInstall = Boolean(packs?.some((pack) => !pack.installed));
  const allInstalled = Boolean(packs?.length) && !canInstall;

  return (
    <section aria-label={t(allInstalled ? "home.packs.installedTitle" : "home.packs.title")} className="w-full min-w-0">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-muted/60 text-muted-foreground">
          {allInstalled ? <Check className="size-5" aria-hidden="true" /> : <Package className="size-5" aria-hidden="true" />}
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold tracking-tight">{t(allInstalled ? "home.packs.installedTitle" : "home.packs.title")}</h2>
          <p className="mt-1 max-w-[72ch] text-xs leading-5 text-muted-foreground">
            {t(allInstalled ? "home.packs.installedDescription" : "home.packs.description")}
          </p>
        </div>
      </div>

      {pending ? (
        <div className="py-8">
          <Loading />
        </div>
      ) : error ? (
        <div className="py-8">
          <ErrorState error={error} />
        </div>
      ) : packs && packs.length > 0 ? (
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(min(320px,100%),1fr))] gap-2">
          {packs.map((pack) => {
            const community = pack.origin === "github";
            const id = pack.repo ?? pack.name;
            return (
              <div
                key={id}
                data-pack={community ? id : undefined}
                className="relative flex h-full items-start gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5"
              >
                {!pack.installed && !installing && !community ? (
                  <label htmlFor={`pack-${id}`} aria-label={id} className="absolute inset-0 cursor-pointer rounded-xl" />
                ) : null}
                {community ? (
                  <span
                    aria-hidden="true"
                    title={t("home.packs.github")}
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border border-border bg-muted/50 text-muted-foreground"
                  >
                    <GitFork className="size-3" strokeWidth={2.5} />
                  </span>
                ) : pack.installed ? (
                  <span
                    aria-hidden="true"
                    className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-[6px] border border-border bg-muted/50 text-muted-foreground"
                  >
                    <Check className="size-3" strokeWidth={2.5} />
                  </span>
                ) : (
                  <Checkbox
                    id={`pack-${id}`}
                    checked={selected.has(pack.name)}
                    disabled={installing}
                    onCheckedChange={() => onToggle(pack.name)}
                    aria-label={id}
                    className="-mx-1 -my-0.5 rounded-lg p-1 transition-colors hover:bg-muted/40"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium">{id}</span>
                    <span className="font-mono text-[10.5px] text-muted-foreground">{t("home.packs.notes", { count: pack.notes })}</span>
                    {community ? (
                      <span className="rounded-full border border-border/70 bg-muted/60 px-1.5 py-px font-mono text-[9.5px] uppercase text-muted-foreground">
                        {t("home.packs.github")}
                      </span>
                    ) : null}
                    {pack.installed ? (
                      <span className="basis-full font-mono text-[10.5px] text-muted-foreground sm:basis-auto">
                        {t("home.packs.installed", { version: pack.installed })}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{packDescription(pack, language)}</p>
                  {community && !pack.installed && pendingPacks.has(id) ? (
                    <Link
                      to={`/inbox?pack=${encodeURIComponent(id)}`}
                      className="mt-1 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      {t("home.packs.reviewInbox")}
                      <ArrowRight className="size-3" aria-hidden="true" />
                    </Link>
                  ) : null}
                  {pack.requires.length > 0 ? (
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {t("home.packs.requires", { packs: pack.requires.join(", ") })}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-5 text-sm text-muted-foreground">{t("home.packs.none")}</p>
      )}

      <div className="mt-4 rounded-xl border border-border/70 bg-muted/30 p-3">
        <label htmlFor="pack-add-repo" className="text-xs font-medium">
          {t("home.packs.addFromGithub")}
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            id="pack-add-repo"
            data-testid="pack-add-repo"
            value={repoInput}
            onChange={(event) => setRepoInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && repoInput.trim() && !add.isPending) add.mutate(repoInput.trim());
            }}
            placeholder={t("home.packs.addPlaceholder")}
            disabled={add.isPending}
            spellCheck={false}
            autoComplete="off"
            className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-muted/50 px-2.5 font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
          <Button
            size="sm"
            pressScale={0.97}
            disabled={!repoInput.trim() || add.isPending}
            onClick={() => add.mutate(repoInput.trim())}
            className="h-8 px-4"
          >
            {add.isPending ? (
              <Loader variant="spinner" size={14} label={t("home.packs.adding")} />
            ) : (
              <GitFork className="size-3.5" aria-hidden="true" />
            )}
            {t("home.packs.add")}
          </Button>
        </div>
        {addError ? (
          <p role="alert" className="mt-2 text-xs text-destructive-text">
            {addError.message}
            {"hint" in addError && addError.hint ? ` — ${addError.hint}` : ""}
          </p>
        ) : null}
        {added ? (
          <div data-testid="pack-add-result" className="mt-2 rounded-lg border border-border/60 bg-muted/50 p-3">
            <p className="text-xs font-medium">{t("home.packs.added", { name: added.name, version: added.version })}</p>
            <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
              {t("home.packs.summary", {
                new: added.proposed_new.length,
                changed: added.proposed_changed.length,
                unchanged: added.unchanged.length,
                invalid: added.invalid.length,
              })}
            </p>
            {added.invalid.length > 0 ? (
              <ul className="mt-1 flex flex-col gap-0.5">
                {added.invalid.map((item) => (
                  <li key={item.file} className="truncate font-mono text-[10px] text-muted-foreground">
                    {t("home.packs.invalidNote", { file: item.file, reason: item.reason })}
                  </li>
                ))}
              </ul>
            ) : null}
            <Link
              to={`/inbox?pack=${encodeURIComponent(added.name)}`}
              className="mt-2 inline-flex items-center gap-1 rounded-sm text-xs font-medium underline decoration-border underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("home.packs.reviewInbox")}
              <ArrowRight className="size-3" aria-hidden="true" />
            </Link>
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        {canInstall ? (
          <>
            <div className="flex items-center gap-2">
              <span id="pack-language-label" className="text-xs text-muted-foreground">
                {t("home.packs.language")}
              </span>
              <fieldset className="m-0 min-w-0 border-0 p-0" aria-labelledby="pack-language-label">
                <Tabs value={packLanguage} onValueChange={(value) => onLanguageChange(value as Language)} variant="segment">
                  <TabsList>
                    {(["en", "es"] as const).map((option) => (
                      <TabsTrigger key={option} value={option} className="px-2.5 py-1 text-[11px] font-medium uppercase">
                        {option}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </fieldset>
            </div>
            <Button
              size="sm"
              pressScale={0.97}
              disabled={selected.size === 0 || installing || Boolean(error)}
              onClick={onInstall}
              className="h-8 px-4"
            >
              {installing ? (
                <Loader variant="spinner" size={14} label={t("home.packs.installing")} />
              ) : (
                <Package className="size-3.5" aria-hidden="true" />
              )}
              {t(selected.size === 1 ? "home.packs.installOne" : "home.packs.install", { count: selected.size })}
            </Button>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event("basics:new-note"))}
          className="rounded-sm text-xs text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("home.packs.createNote")}
        </button>
        {allInstalled ? (
          <Link
            to="/"
            className="rounded-sm text-xs text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("home.packs.backHome")}
          </Link>
        ) : null}
      </div>
    </section>
  );
}

interface GettingStartedProps {
  notes: number;
  projects: number;
  /** The packs grid is on screen, so step 1 already has its way in right below. */
  packsVisible: boolean;
}

/**
 * One quiet line while a first-run step is still open: the next step, its way in,
 * and a dismiss that remembers the choice on this device.
 */
function GettingStarted({ notes, projects, packsVisible }: GettingStartedProps) {
  const { t } = useI18n();
  const connect = useConnectStatus();
  const connected = connect.data?.clients.some((client) => client.connected) ?? false;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(SETUP_KEY) === "1";
    } catch {
      return false;
    }
  });

  const dismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(SETUP_KEY, "1");
    } catch {
      // Storage can be unavailable in private or restricted contexts.
    }
  };

  const steps = [
    {
      key: "notes",
      done: notes > 0,
      label: t("home.steps.notes"),
      action: packsVisible ? null : { to: "/?packs=1", label: t("home.steps.notes.action") },
    },
    {
      key: "agent",
      done: connected,
      label: t("home.steps.agent"),
      action: { to: "/settings?section=agents", label: t("home.steps.agent.action") },
    },
    {
      key: "project",
      done: projects > 0,
      label: t("home.steps.project"),
      action: { to: "/recommend", label: t("home.steps.project.action") },
    },
  ];
  const done = steps.filter((step) => step.done).length;
  const next = steps.find((step) => !step.done);
  if (!next || dismissed) return null;

  return (
    <section
      data-testid="home-getting-started"
      aria-label={t("home.steps.progress", { done })}
      className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-1.5"
    >
      <h2 className="shrink-0 text-xs font-semibold">{t("home.steps.title")}</h2>
      <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{t("home.steps.next", { step: next.label })}</p>
      {next.action ? (
        <Link
          to={next.action.to}
          className="inline-flex shrink-0 items-center gap-0.5 rounded-sm text-[11px] text-muted-foreground underline decoration-border underline-offset-2 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {next.action.label}
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      ) : null}
      <button
        type="button"
        aria-label={t("home.steps.dismiss")}
        onClick={dismiss}
        className="grid size-6 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </section>
  );
}

interface InboxStripProps {
  /** At most three most recent proposals to preview. */
  proposals: ProposalSummary[];
  /** Total pending proposals in the inbox. */
  total: number;
  isPending: boolean;
  error: Error | null;
  armed: string | null;
  busyId: string | undefined;
  onReject: (id: string) => void;
}

/**
 * The first thing under the page title: when the inbox is empty it collapses to a
 * single line, otherwise it previews at most three proposal cards and links to the
 * rest. Always the same height contract so the grid below can size itself.
 */
function InboxStrip({ proposals, total, isPending, error, armed, busyId, onReject }: InboxStripProps) {
  const { t, language } = useI18n();
  const navigate = useIntentNavigate();
  const reduce = useReducedMotion() ?? false;

  if (isPending) {
    return (
      <section data-testid="inbox-strip" aria-label={t("home.waiting")} className="min-w-0">
        <Loading />
      </section>
    );
  }

  if (error) {
    return (
      <section data-testid="inbox-strip" aria-label={t("home.waiting")} className="min-w-0">
        <ErrorState error={error} />
      </section>
    );
  }

  if (proposals.length === 0) {
    return (
      <section
        data-testid="inbox-strip"
        aria-label={t("home.waiting")}
        className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-3 py-1.5"
      >
        <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-full bg-muted/60 text-muted-foreground">
          <Inbox className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{t("home.inboxClear")}</span>
        <Link
          to="/inbox"
          className="inline-flex shrink-0 items-center gap-1 rounded-sm text-[11px] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {t("home.allProposals")}
          <ArrowRight className="size-3" aria-hidden="true" />
        </Link>
      </section>
    );
  }

  return (
    <section data-testid="inbox-strip" aria-label={t("home.waiting")} className="min-w-0">
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
        <AnimatePresence initial={false} mode="popLayout">
          {proposals.map((proposal) => {
            const pack = packProposer(proposal.meta.proposed_by);
            const busy = busyId === proposal.id;
            return (
              <motion.div
                key={proposal.id}
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
                  agentName={
                    pack
                      ? t("inbox.byPack", { name: pack.name, version: pack.version })
                      : t("inbox.by", { name: proposal.meta.proposed_by })
                  }
                  agentInitial={agentInitial(proposal.meta.proposed_by)}
                  agentColor={agentColor(proposal.meta.proposed_by)}
                  agentForeground="#111113"
                  agentKind={pack ? "pack" : "agent"}
                  reason={proposal.meta.reason}
                  reasonLines={1}
                  time={
                    <time dateTime={proposal.meta.created} title={proposal.meta.created}>
                      {formatRelativeTime(proposal.meta.created, language)}
                    </time>
                  }
                  status={busy ? "submitting" : "pending"}
                  busy={busy}
                  reviewLabel={t("proposal.review")}
                  rejectLabel={t("proposal.reject")}
                  rejectConfirmLabel={t("proposal.rejectConfirm")}
                  rejectArmed={armed === proposal.id}
                  onOpen={() => navigate(`/inbox/${encodeURIComponent(proposal.id)}`)}
                  onReview={() => navigate(`/inbox/${encodeURIComponent(proposal.id)}`)}
                  onReject={() => onReject(proposal.id)}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {total > proposals.length ? (
        <div className="mt-2">
          <Link
            to="/inbox"
            className="inline-flex items-center gap-1 rounded-sm text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("home.seeAll", { count: total })}
            <ArrowRight className="size-3" aria-hidden="true" />
          </Link>
        </div>
      ) : null}
    </section>
  );
}

interface HealthDetailProps {
  /** Metric id for the `data-stat` hook and tests. */
  stat: string;
  /** Singular name used in the trigger's accessible name, e.g. "Broken links". */
  label: string;
  /** Count shown in the accessible name. */
  value: number;
  /** The already pluralized line the user reads. */
  text: string;
  /** A severity mark, so the warning does not rest on the colour alone. */
  icon: ReactNode;
  children: (close: () => void) => ReactNode;
}

/**
 * A health metric with details: above zero it opens the same list (and the same
 * Open/Create actions) the old Home tile did; at zero it stays plain text.
 */
function HealthDetail({ stat, label, value, text, icon, children }: HealthDetailProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <MorphPopover open={open} onOpenChange={setOpen}>
      <MorphPopoverTrigger>
        <button
          type="button"
          data-stat={stat}
          data-alert="true"
          aria-label={`${label}: ${value} — ${t("home.showDetails")}`}
          className={cn(HEALTH_LINK, "inline-flex items-center gap-1 text-destructive-text")}
        >
          {icon}
          {text}
        </button>
      </MorphPopoverTrigger>
      <MorphPopoverContent side="top" align="start" className="w-80 p-2">
        {children(() => setOpen(false))}
      </MorphPopoverContent>
    </MorphPopover>
  );
}

/** One quiet line: how much is in the vault, and what needs attention. */
function HealthLine({ stats }: { stats: ReturnType<typeof useStats> }) {
  const { t } = useI18n();
  const navigate = useIntentNavigate();
  if (stats.isPending) {
    return (
      <section data-testid="health-line" aria-label={t("home.health")} className="flex min-h-6 items-center gap-3">
        {[16, 20, 14].map((width) => (
          <span
            key={width}
            aria-hidden="true"
            className="h-3 rounded-full bg-muted motion-safe:animate-pulse"
            style={{ width: `${width * 4}px` }}
          />
        ))}
      </section>
    );
  }

  if (stats.error) {
    return (
      <section data-testid="health-line" aria-label={t("home.health")} className="min-h-6">
        <ErrorState error={stats.error} />
      </section>
    );
  }

  const total = stats.data?.total ?? 0;
  const brokenLinks = stats.data?.brokenLinks ?? [];
  const orphans = stats.data?.orphans ?? [];
  const broken = brokenLinks.length;
  const orphanCount = orphans.length;

  return (
    <section
      data-testid="health-line"
      aria-label={t("home.health")}
      className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground"
    >
      <Link data-stat="notes" to="/explore" className={HEALTH_LINK}>
        {t(total === 1 ? "home.health.notesOne" : "home.health.notes", { count: total })}
      </Link>
      <span aria-hidden="true" className="text-border">
        ·
      </span>
      {broken > 0 ? (
        <HealthDetail
          stat="broken"
          label={t("home.brokenLinks")}
          value={broken}
          text={t(broken === 1 ? "home.health.brokenOne" : "home.health.broken", { count: broken })}
          icon={<Link2Off className="size-3.5 shrink-0" aria-hidden="true" />}
        >
          {(close) => (
            <ul className="flex flex-col gap-0.5 p-1">
              {brokenLinks.map((link) => (
                <li key={`${link.from}-${link.to}`} data-broken-link={link.to} className="flex min-w-0 items-center gap-1">
                  <span className="min-w-0 flex-1 truncate px-1.5 font-mono text-[11px] text-muted-foreground">
                    {link.from} <span className="text-foreground/50">→</span> {link.to}
                  </span>
                  <button
                    type="button"
                    aria-label={t("home.brokenLinkOpen", { id: link.from })}
                    onClick={() => {
                      close();
                      navigate(`/notes/${encodeURIComponent(link.from)}`);
                    }}
                    className={POPOVER_ACTION}
                  >
                    {t("home.brokenLinkOpenShort")}
                  </button>
                  <button
                    type="button"
                    aria-label={t("home.brokenLinkCreate", { id: link.to })}
                    onClick={() => {
                      close();
                      window.dispatchEvent(new CustomEvent("basics:new-note", { detail: { id: link.to } }));
                    }}
                    className={cn(POPOVER_ACTION, "text-primary-text")}
                  >
                    {t("home.brokenLinkCreateShort")}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </HealthDetail>
      ) : (
        <span data-stat="broken">{t("home.health.broken", { count: 0 })}</span>
      )}
      <span aria-hidden="true" className="text-border">
        ·
      </span>
      {orphanCount > 0 ? (
        <HealthDetail
          stat="orphans"
          label={t("home.orphans")}
          value={orphanCount}
          text={t(orphanCount === 1 ? "home.health.orphanOne" : "home.health.orphans", { count: orphanCount })}
          icon={<CircleDashed className="size-3.5 shrink-0" aria-hidden="true" />}
        >
          {(close) => (
            <ul className="flex flex-col gap-0.5 p-1">
              {orphans.map((id) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      navigate(`/notes/${encodeURIComponent(id)}`);
                    }}
                    className="w-full truncate rounded-md px-1.5 py-1 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    {id}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </HealthDetail>
      ) : (
        <span data-stat="orphans">{t("home.health.orphans", { count: 0 })}</span>
      )}
    </section>
  );
}

interface ContinueItem {
  id: string;
  title: string;
  type: string;
  time: string;
}

function ContinueSection({
  items,
  pending,
  error,
  language,
}: {
  items: ContinueItem[];
  pending: boolean;
  error: Error | null;
  language: string;
}) {
  const { t } = useI18n();

  return (
    <section aria-labelledby="home-continue-label" className="min-w-0">
      <SectionLabel id="home-continue-label">{t("home.continue")}</SectionLabel>
      <div data-testid="continue-list" className="mt-1 flex min-w-0 flex-col">
        {pending ? (
          <div role="status" aria-label={t("state.loading")} className="flex flex-col">
            <span className="sr-only">{t("state.loading")}</span>
            {["a", "b", "c", "d", "e"].map((row) => (
              <div
                key={row}
                aria-hidden="true"
                className="flex items-center border-b border-border/50 px-0.5 last:border-0"
                style={{ minHeight: CONTINUE_ROW_HEIGHT }}
              >
                <span className="h-3 w-1/3 rounded-full bg-muted motion-safe:animate-pulse" />
              </div>
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} />
        ) : (
          <ul className="flex min-w-0 flex-col">
            {items.map((item) => (
              <li key={item.id} className="border-b border-border/50 last:border-0">
                <Link
                  to={item.type === "project" ? `/projects?p=${encodeURIComponent(item.id)}` : `/notes/${encodeURIComponent(item.id)}`}
                  className="flex items-center gap-3 px-0.5 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  style={{ minHeight: CONTINUE_ROW_HEIGHT }}
                >
                  <span className="min-w-0 flex-1 truncate text-sm">{item.title}</span>
                  {item.time ? (
                    <time
                      dateTime={item.time}
                      title={formatFullDateTime(item.time, language)}
                      className="shrink-0 whitespace-nowrap font-mono text-[10px] text-muted-foreground"
                    >
                      {formatRelativeTime(item.time, language)}
                    </time>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function HomePage() {
  const { t, language } = useI18n();
  const navigate = useIntentNavigate();
  const queryClient = useQueryClient();

  const stats = useStats();
  const inbox = useInbox();
  const notes = useNotes();
  const dayActivity = useActivity({ limit: 200 });
  const connectStatus = useConnectStatus();
  const [searchParams] = useSearchParams();
  const forcePacks = searchParams.get("packs") === "1";
  const showPacks = forcePacks || stats.data?.total === 0;
  const packs = usePacks(showPacks);

  const notesTotal = stats.data?.total ?? 0;
  const projectsTotal = stats.data?.counts.project ?? 0;
  const stepsComplete = notesTotal > 0 && projectsTotal > 0 && (connectStatus.data?.clients.some((client) => client.connected) ?? false);
  const showSteps = Boolean(stats.data) && !stepsComplete;

  // Questions about a normal vault are still loading when Home first paints, so treat the
  // description as settled rather than showing it and pulling it away a frame later.
  const intro = useIntro("home", stats.isSuccess ? notesTotal > 0 : true);
  useDocumentTitle(t("home.title"));

  const [selectedPacks, setSelectedPacks] = useState<Set<string>>(new Set());
  const [packLanguage, setPackLanguage] = useState<Language>(language);
  // The config request can resolve after first paint; keep the default aligned with
  // the UI language until the user picks a pack language themselves.
  useEffect(() => setPackLanguage(language), [language]);
  useEffect(() => {
    if (!packs.data) return;
    setSelectedPacks(new Set(packs.data.filter((pack) => !pack.installed).map((pack) => pack.name)));
  }, [packs.data]);

  const [armed, setArmed] = useState<string | null>(null);
  const armTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(armTimer.current), []);

  const noteById = useMemo(() => new Map((notes.data ?? []).map((note) => [note.id, note])), [notes.data]);
  const [history] = useState<RecentItem[]>(() => readRecentItems());

  const continueItems = useMemo<ContinueItem[]>(() => {
    const seen = new Set<string>();
    const items: ContinueItem[] = [];
    const push = (note: { id: string; title?: string; type: string }, time: string) => {
      if (items.length >= CONTINUE_ROWS || seen.has(note.id)) return;
      seen.add(note.id);
      items.push({ id: note.id, title: note.title || note.id, type: note.type, time });
    };
    // Local opens first, then top up with the vault's recently updated notes so the
    // list keeps its full height when this device only has one or two opens.
    for (const entry of history) {
      const note = noteById.get(entry.id);
      if (note) push(note, entry.opened);
    }
    for (const note of stats.data?.recent ?? []) push(note, note.updated ?? "");
    return items;
  }, [history, noteById, stats.data]);

  const proposals = useMemo<ProposalSummary[]>(
    () => [...(inbox.data ?? [])].sort((a, b) => Date.parse(b.meta.created) - Date.parse(a.meta.created)).slice(0, 3),
    [inbox.data],
  );
  const pendingTotal = inbox.data?.length ?? 0;

  const dailyGroups = useMemo(() => groupActivity((dayActivity.data ?? []).filter((event) => isToday(event.ts))), [dayActivity.data]);
  const [showAllActivity, setShowAllActivity] = useState(false);
  const activityGroups = showAllActivity ? dailyGroups : dailyGroups.slice(0, ACTIVITY_ROWS);

  const pendingCommunityPacks = useMemo(
    () =>
      new Set(
        (inbox.data ?? []).map((proposal) => packProposer(proposal.meta.proposed_by)?.name).filter((name): name is string => Boolean(name)),
      ),
    [inbox.data],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    void queryClient.invalidateQueries({ queryKey: ["notes"] });
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  };

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

  const install = useMutation({
    mutationFn: async (names: string[]) => {
      for (const name of names) await installPack(name, packLanguage);
    },
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ["packs"] });
      void queryClient.invalidateQueries({ queryKey: ["layers"] });
      void queryClient.invalidateQueries({ queryKey: ["graph"] });
      toast.success(t("home.packs.installedToast"));
      navigate("/", { replace: true });
    },
    onError: () => toast.error(t("home.packs.installFailed")),
  });

  const togglePack = (name: string) => {
    setSelectedPacks((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

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

  const busyId = reject.isPending && typeof reject.variables === "string" ? reject.variables : undefined;

  return (
    <Page className={PAGE_SECTIONS}>
      <div className="flex flex-col gap-3">
        <PageHeader
          title={t("home.title")}
          description={intro.showIntro ? t("home.intro") : undefined}
          hint={intro.showIntro ? undefined : t("home.intro")}
          onDismissDescription={intro.showIntro ? intro.dismiss : undefined}
        />
        {/* Health belongs with the title: once the intro moves behind `?` it should not
            leave a blank section between the heading and the counts. */}
        {showPacks ? null : <HealthLine stats={stats} />}
      </div>

      {showPacks ? (
        <>
          {showSteps ? (
            <div>
              <GettingStarted notes={notesTotal} projects={projectsTotal} packsVisible />
            </div>
          ) : null}
          <div>
            <StarterPacks
              packs={packs.data}
              pending={packs.isPending}
              error={packs.error}
              language={language}
              packLanguage={packLanguage}
              selected={selectedPacks}
              installing={install.isPending}
              pendingPacks={pendingCommunityPacks}
              onToggle={togglePack}
              onLanguageChange={setPackLanguage}
              onInstall={() => install.mutate([...selectedPacks])}
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <InboxStrip
              proposals={proposals}
              total={pendingTotal}
              isPending={inbox.isPending}
              error={inbox.error}
              armed={armed}
              busyId={busyId}
              onReject={requestReject}
            />
          </div>

          {/*
            The proposal strip is the only async block above the rest, and its final height
            depends on how many proposals exist. Nothing mounts below it until it resolves and
            reports that height, so late proposals never push the rest of Home down.
          */}
          {inbox.isPending ? null : (
            <>
              <div>
                <ContinueSection items={continueItems} pending={notes.isPending} error={notes.error} language={language} />
              </div>

              <div>
                <section aria-labelledby="home-activity-label" className="min-w-0">
                  <div className="flex min-h-6 items-baseline justify-between gap-3">
                    <SectionLabel id="home-activity-label">{t("home.activity")}</SectionLabel>
                    {dailyGroups.length > ACTIVITY_ROWS ? (
                      <button
                        type="button"
                        aria-expanded={showAllActivity}
                        onClick={() => setShowAllActivity((open) => !open)}
                        className="shrink-0 rounded-sm text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {showAllActivity ? t("home.activity.showLess") : t("home.activity.showAll", { count: dailyGroups.length })}
                      </button>
                    ) : null}
                  </div>

                  {dayActivity.isPending ? (
                    <div role="status" aria-label={t("state.loading")} className="mt-1 flex flex-col">
                      <span className="sr-only">{t("state.loading")}</span>
                      {["a", "b", "c"].map((row) => (
                        <span
                          key={row}
                          aria-hidden="true"
                          className="flex items-center border-b border-border/50 last:border-0"
                          style={{ minHeight: ACTIVITY_ROW_HEIGHT }}
                        >
                          <span className="h-3 w-1/2 rounded-full bg-muted motion-safe:animate-pulse" />
                        </span>
                      ))}
                    </div>
                  ) : dayActivity.error ? (
                    <div className="mt-2">
                      <ErrorState error={dayActivity.error} />
                    </div>
                  ) : dailyGroups.length === 0 ? (
                    <div className="mt-2">
                      <p className="text-sm text-muted-foreground">
                        {t((dayActivity.data ?? []).length === 0 ? "home.noAgents" : "home.activity.quiet")}
                      </p>
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
                    <ul
                      data-testid="activity-list"
                      className="mt-1 flex flex-col"
                      style={{ minHeight: ACTIVITY_ROWS * ACTIVITY_ROW_HEIGHT }}
                    >
                      {activityGroups.map((group) => {
                        const names = group.noteIds.slice(0, 2).map((id) => noteById.get(id)?.title || id);
                        const more = group.noteIds.length - names.length;
                        return (
                          <li
                            key={group.key}
                            className="flex items-baseline gap-3 border-b border-border/50 py-1.5 last:border-0"
                            style={{ minHeight: ACTIVITY_ROW_HEIGHT }}
                          >
                            <span className="min-w-0 flex-1 truncate text-xs">
                              <span className="font-medium">{group.event.agent}</span>{" "}
                              <span className="text-muted-foreground">{verbFor(group)}</span>
                              {group.count > 1 && group.event.tool !== "get_note" ? (
                                <span className="text-muted-foreground"> x{group.count}</span>
                              ) : null}
                              {group.event.tool === "search_vault" && group.detail ? (
                                <span className="text-muted-foreground"> “{group.detail}”</span>
                              ) : null}
                              {names.length > 0 ? (
                                <span className="text-muted-foreground">
                                  {" "}
                                  · {names.join(", ")}
                                  {more > 0 ? ` +${more}` : ""}
                                </span>
                              ) : null}
                            </span>
                            <time
                              className="shrink-0 font-mono text-[10px] whitespace-nowrap text-muted-foreground"
                              dateTime={group.event.ts}
                              title={formatFullDateTime(group.event.ts, language)}
                            >
                              {formatCompactRelativeTime(group.event.ts)}
                            </time>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              </div>

              {showSteps ? (
                <div>
                  <GettingStarted notes={notesTotal} projects={projectsTotal} packsVisible={false} />
                </div>
              ) : null}
            </>
          )}
        </>
      )}
    </Page>
  );
}
