import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, ChevronDown, Copy, MonitorSmartphone } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/motion/button/base";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/motion/collapsible";
import { Switch } from "@/components/motion/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { PAGE_SECTIONS, Page } from "@/components/page";
import { ErrorState, Loading } from "@/components/state";
import { type TranslationKey, useI18n, useT } from "@/i18n";
import { agentColor, agentInitial } from "@/lib/agent-color";
import { type ConnectClientId, connectClients, disableEmbeddings, disconnectClients, enableEmbeddings, type Language } from "@/lib/api";
import { isDesktop } from "@/lib/desktop";
import { useEmbeddingsProgress } from "@/lib/events";
import { queryKeys, useConnectStatus, useEmbeddings, useHealth } from "@/lib/queries";
import { type Theme, useTheme } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const SECTIONS = ["general", "startup", "agents", "search", "updates", "about"] as const;
type SectionId = (typeof SECTIONS)[number];

const SECTION_LABEL: Record<SectionId, TranslationKey> = {
  general: "settings.section.general",
  startup: "settings.section.startup",
  agents: "settings.section.agents",
  search: "settings.section.search",
  updates: "settings.section.updates",
  about: "settings.section.about",
};

/** Product names stay untranslated; the order matches `CONNECT_CLIENTS` on the server. */
const CLIENTS: { id: ConnectClientId; name: string }[] = [
  { id: "claude-code", name: "Claude Code" },
  { id: "opencode", name: "opencode" },
  { id: "codex", name: "Codex" },
  { id: "cursor", name: "Cursor" },
  { id: "claude-desktop", name: "Claude Desktop" },
];

const LINKS = {
  docs: "https://marcozvd.github.io/basics/",
  desktop: "https://marcozvd.github.io/basics/guide/desktop.html",
  github: "https://github.com/MarcoZVD/basics",
  licenses: "https://github.com/MarcoZVD/basics/blob/main/THIRD_PARTY_NOTICES.md",
};

function isSection(value: string | null): value is SectionId {
  return value !== null && (SECTIONS as readonly string[]).includes(value);
}

/** A `Saved` tag that shows for a moment after a control was written. */
function useSavedFlash(): [boolean, () => void] {
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const flash = useCallback(() => {
    setVisible(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(false), 1800);
  }, []);

  useEffect(() => () => window.clearTimeout(timer.current), []);
  return [visible, flash];
}

function SavedHint({ visible }: { visible: boolean }) {
  const t = useT();
  return (
    <AnimatePresence initial={false}>
      {visible ? (
        <motion.span
          role="status"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="text-[11px] font-medium text-muted-foreground"
        >
          {t("settings.saved")}
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error(t("settings.copyFailed"));
    }
  };

  const text = copied ? t("settings.copied") : (label ?? t("settings.copy"));

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={text}
      title={text}
      onClick={() => void copy()}
      className="size-7 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
    </Button>
  );
}

function Section({ id, title, description, children }: { id: SectionId; title: string; description?: string; children: ReactNode }) {
  return (
    <section id={`settings-${id}`} aria-labelledby={`settings-${id}-title`} className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id={`settings-${id}-title`} className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        {description ? <p className="max-w-[68ch] text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** One group of rows: a single card with hairline separators, like the rest of the app. */
function Rows({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card", className)}>{children}</div>;
}

function Row({
  title,
  description,
  children,
  status,
  vertical,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  status?: ReactNode;
  vertical?: boolean;
}) {
  return (
    <div className={cn("flex gap-3 px-4 py-3.5", vertical ? "flex-col" : "flex-wrap items-center justify-between")}>
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description ? <p className="mt-0.5 max-w-[56ch] text-xs text-muted-foreground">{description}</p> : null}
      </div>
      <div className={cn("flex items-center gap-2", vertical && "w-full")}>
        {children}
        {status}
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: "primary" | "muted" | "plain"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone === "primary" && "border-primary/30 bg-primary/10 text-primary-text",
        tone === "muted" && "border-border bg-muted/60 text-muted-foreground",
        tone === "plain" && "border-dashed border-border text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function GeneralSection() {
  const t = useT();
  const { language, setLanguage } = useI18n();
  const { theme, setTheme } = useTheme();
  const health = useHealth();
  const desktop = useMemo(() => isDesktop(), []);
  const [savedLanguage, flashLanguage] = useSavedFlash();
  const [savedTheme, flashTheme] = useSavedFlash();
  const [languageError, setLanguageError] = useState(false);

  const changeLanguage = async (next: Language) => {
    setLanguageError(false);
    const ok = await setLanguage(next);
    if (ok) flashLanguage();
    else setLanguageError(true);
  };

  const vault = health.data?.vault;

  return (
    <Section id="general" title={t("settings.general.title")} description={t("settings.general.description")}>
      <Rows>
        <Row
          title={t("settings.language.title")}
          description={t("settings.language.description")}
          status={
            <>
              <SavedHint visible={savedLanguage} />
              {languageError ? (
                <span role="alert" className="text-[11px] text-destructive">
                  {t("settings.language.failed")}
                </span>
              ) : null}
            </>
          }
        >
          <fieldset className="m-0 min-w-0 border-0 p-0" aria-label={t("settings.language.title")}>
            <Tabs value={language} onValueChange={(value) => void changeLanguage(value as Language)} variant="segment">
              <TabsList>
                <TabsTrigger value="en" className="px-3 py-1 text-xs font-medium">
                  {t("settings.language.english")}
                </TabsTrigger>
                <TabsTrigger value="es" className="px-3 py-1 text-xs font-medium">
                  {t("settings.language.spanish")}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </fieldset>
        </Row>
        <Row title={t("settings.theme.title")} description={t("settings.theme.description")} status={<SavedHint visible={savedTheme} />}>
          <fieldset className="m-0 min-w-0 border-0 p-0" aria-label={t("settings.theme.title")}>
            <Tabs
              value={theme}
              onValueChange={(value) => {
                setTheme(value as Theme);
                flashTheme();
              }}
              variant="segment"
            >
              <TabsList>
                {(["system", "light", "dark"] as const).map((option) => (
                  <TabsTrigger key={option} value={option} className="px-3 py-1 text-xs font-medium">
                    {t(`settings.theme.${option}`)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </fieldset>
        </Row>
        <Row title={t("settings.vault.title")} description={t("settings.vault.description")}>
          <span title={vault} className="max-w-[42ch] truncate font-mono text-[11px] text-muted-foreground max-sm:max-w-[52vw]">
            {vault ?? t("nav.vaultUnavailable")}
          </span>
          {vault ? <CopyButton value={vault} /> : null}
        </Row>
      </Rows>

      {desktop ? (
        <p className="text-xs text-muted-foreground">{t("settings.vault.desktopHint")}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">{t("settings.vault.cliHint")}</p>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
            <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px] whitespace-nowrap">
              basics config set vault &lt;folder&gt;
            </code>
          </div>
        </div>
      )}
    </Section>
  );
}

function DesktopOnlySection({ id, description, body }: { id: SectionId; description: string; body: string }) {
  const t = useT();
  const desktop = useMemo(() => isDesktop(), []);
  return (
    <Section id={id} title={t(`settings.${id}.title`)} description={description}>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card px-4 py-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <MonitorSmartphone className="size-4 shrink-0" aria-hidden="true" />
          <p className="text-sm font-medium text-foreground">{t("settings.desktopOnly.title")}</p>
        </div>
        <p className="max-w-[68ch] text-sm text-muted-foreground">{body}</p>
        {desktop ? null : (
          <a
            href={LINKS.desktop}
            target="_blank"
            rel="noreferrer"
            className="inline-flex w-fit items-center gap-1 rounded-sm text-sm font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("settings.desktopOnly.link")}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </Section>
  );
}

interface ClientFeedback {
  diff?: string;
  note?: string;
  error?: string;
}

function AgentsSection() {
  const t = useT();
  const queryClient = useQueryClient();
  const status = useConnectStatus();
  const [feedback, setFeedback] = useState<Partial<Record<ConnectClientId, ClientFeedback>>>({});
  const [openDiffs, setOpenDiffs] = useState<Partial<Record<ConnectClientId, boolean>>>({});

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.connectStatus });
  };

  /**
   * The server only reports a diff for a dry run, so each connect asks twice: once to see
   * exactly what would change, then for real. The write is the same in both passes.
   */
  const connect = useMutation({
    mutationFn: async (clients: ConnectClientId[]) => {
      const dry = await connectClients({ clients, dryRun: true });
      const applied = await connectClients({ clients });
      return { dry, applied };
    },
    onSuccess: ({ dry, applied }) => {
      // A client whose write failed comes back as an `error` entry instead of a rejected call.
      const failed = applied.entries.filter((entry) => entry.result === "error");
      setFeedback((current) => {
        const next = { ...current };
        for (const entry of dry.entries) {
          const diff = [entry.diff, entry.skill?.diff].filter((part): part is string => Boolean(part)).join("\n");
          next[entry.client] = diff ? { diff } : entry.result === "unchanged" ? { note: t("settings.agents.unchanged") } : {};
        }
        for (const entry of failed) {
          next[entry.client] = { error: entry.message ?? t("state.error.unknown") };
        }
        return next;
      });
      if (failed.length === 0) toast.success(t("settings.saved"));
      refresh();
    },
    onError: (error, clients) => {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback((current) => {
        const next = { ...current };
        for (const client of clients) next[client] = { error: message };
        return next;
      });
    },
  });

  const disconnect = useMutation({
    mutationFn: (client: ConnectClientId) => disconnectClients({ clients: [client] }),
    onSuccess: (result, client) => {
      const failed = result.entries.find((entry) => entry.result === "error");
      setFeedback((current) => ({
        ...current,
        [client]: failed ? { error: failed.message ?? t("state.error.unknown") } : {},
      }));
      if (!failed) toast.success(t("settings.saved"));
      refresh();
    },
    onError: (error, client) => {
      const message = error instanceof Error ? error.message : String(error);
      setFeedback((current) => ({ ...current, [client]: { error: message } }));
    },
  });

  const clients = status.data?.clients ?? [];
  const detected = clients.filter((entry) => entry.detected);
  const mcpUrl = typeof window === "undefined" ? "/mcp" : `${window.location.origin}/mcp`;
  const busy = connect.isPending || disconnect.isPending;
  const connectingTo = connect.isPending ? (connect.variables ?? []) : [];
  const disconnecting = disconnect.isPending ? disconnect.variables : undefined;

  return (
    <Section id="agents" title={t("settings.agents.title")} description={t("settings.agents.description")}>
      <p className="max-w-[72ch] text-sm text-muted-foreground">{t("settings.agents.explainer")}</p>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
        <span className="text-[11px] font-medium text-muted-foreground">{t("settings.agents.mcpUrl")}</span>
        <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px] whitespace-nowrap">{mcpUrl}</code>
        <CopyButton value={mcpUrl} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {t("settings.agents.cliHint")} <code className="font-mono text-foreground/80">basics connect</code>
        </p>
        <Button
          variant="primary"
          size="sm"
          disabled={busy || detected.length === 0}
          onClick={() => connect.mutate(detected.map((entry) => entry.client))}
        >
          {t("settings.agents.connectAll")}
        </Button>
      </div>

      {status.isPending ? (
        <Loading />
      ) : status.isError ? (
        <ErrorState error={status.error} />
      ) : (
        <Rows>
          {CLIENTS.map(({ id, name }) => {
            const entry = clients.find((client) => client.client === id);
            const connected = entry?.connected ?? false;
            const detectedHere = entry?.detected ?? false;
            const row = feedback[id] ?? {};
            const isConnecting = connectingTo.includes(id);
            const isDisconnecting = disconnecting === id;

            return (
              <div key={id} data-client={id} className="flex flex-col gap-2 px-4 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className="grid size-7 shrink-0 place-items-center rounded-full text-[11px] font-semibold"
                      style={{ backgroundColor: `${agentColor(name)}1f`, color: agentColor(name) }}
                    >
                      {agentInitial(name)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{name}</p>
                      <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted-foreground">{entry?.configPath ?? "—"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {connected ? (
                      <Chip tone="primary">{t("settings.agents.connected")}</Chip>
                    ) : detectedHere ? (
                      <Chip tone="muted">{t("settings.agents.installed")}</Chip>
                    ) : (
                      <Chip tone="plain">{t("settings.agents.missing")}</Chip>
                    )}
                    {entry && entry.skill !== null ? (
                      <Chip tone="muted">{entry.skill ? t("settings.agents.skill") : t("settings.agents.noSkill")}</Chip>
                    ) : null}
                    {connected ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={busy}
                        aria-busy={isDisconnecting}
                        onClick={() => disconnect.mutate(id)}
                      >
                        {t("settings.agents.disconnect")}
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={busy || !detectedHere}
                        aria-busy={isConnecting}
                        onClick={() => connect.mutate([id])}
                      >
                        {t("settings.agents.connect")}
                      </Button>
                    )}
                  </div>
                </div>

                {row.note ? <p className="text-xs text-muted-foreground">{row.note}</p> : null}
                {row.error ? (
                  <p role="alert" className="text-xs text-destructive">
                    {connected
                      ? t("settings.agents.disconnectFailed", { client: name, message: row.error })
                      : t("settings.agents.connectFailed", { client: name, message: row.error })}
                  </p>
                ) : null}
                {row.diff ? (
                  <Collapsible
                    open={openDiffs[id] ?? false}
                    onOpenChange={(open) => setOpenDiffs((current) => ({ ...current, [id]: open }))}
                  >
                    <CollapsibleTrigger className="min-h-7 justify-start gap-1.5 rounded-lg px-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40">
                      <ChevronDown
                        aria-hidden="true"
                        className={cn("size-3.5 shrink-0 transition-transform duration-200", !(openDiffs[id] ?? false) && "-rotate-90")}
                      />
                      {t("settings.agents.showDiff")}
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <pre className="mt-1.5 max-h-64 overflow-auto rounded-xl border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed">
                        {row.diff}
                      </pre>
                    </CollapsibleContent>
                  </Collapsible>
                ) : null}
              </div>
            );
          })}
        </Rows>
      )}
    </Section>
  );
}

function formatSize(bytes: number): string {
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function SearchSection() {
  const t = useT();
  const queryClient = useQueryClient();
  const status = useEmbeddings();
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.embeddings });
  };

  const enable = useMutation({
    mutationFn: enableEmbeddings,
    onSuccess: () => {
      setError(null);
      toast.success(t("settings.saved"));
      refresh();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)),
  });

  const disable = useMutation({
    mutationFn: disableEmbeddings,
    onSuccess: () => {
      setError(null);
      toast.success(t("settings.saved"));
      refresh();
    },
    onError: (cause) => setError(cause instanceof Error ? cause.message : String(cause)),
  });

  const progress = useEmbeddingsProgress(enable.isPending);
  const data = status.data;
  const enabled = data?.enabled ?? false;
  const pending = enable.isPending || disable.isPending;
  const percent = progress && progress.total > 0 ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <Section id="search" title={t("settings.search.title")} description={t("settings.search.description")}>
      <Rows>
        <Row title={t("settings.search.semantic")} description={t("settings.search.semanticDescription")}>
          <Switch
            checked={enabled}
            disabled={!data || pending}
            ariaLabel={t("settings.search.semantic")}
            onCheckedChange={(next) => {
              setError(null);
              if (next) enable.mutate();
              else disable.mutate();
            }}
          />
        </Row>
      </Rows>

      {data ? (
        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          <p>{t("settings.search.download", { size: formatSize(data.download.total) })}</p>
          {enabled ? (
            <p className="font-mono text-[11px]">{t("settings.search.index", { indexed: data.indexed, stale: data.stale })}</p>
          ) : (
            <p>{t("settings.search.disableNote")}</p>
          )}
        </div>
      ) : status.isError ? (
        <ErrorState error={status.error} />
      ) : (
        <Loading />
      )}

      {enable.isPending ? (
        <div className="flex flex-col gap-1.5" role="status">
          <p className="text-xs text-muted-foreground">
            {t("settings.search.enabling", { done: progress?.done ?? 0, total: progress?.total ?? 0 })}
          </p>
          <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {enable.isError ? t("settings.search.enableFailed", { message: error }) : t("settings.search.disableFailed", { message: error })}
        </p>
      ) : null}
    </Section>
  );
}

function AboutSection() {
  const t = useT();
  const health = useHealth();
  const vault = health.data?.vault;

  const links: { href: string; label: string }[] = [
    { href: LINKS.docs, label: t("settings.about.docs") },
    { href: LINKS.github, label: t("settings.about.github") },
    { href: LINKS.licenses, label: t("settings.about.licenses") },
  ];

  return (
    <Section id="about" title={t("settings.about.title")} description={t("settings.about.description")}>
      <Rows>
        <Row title={t("settings.about.version")}>
          <span className="font-mono text-[11px] text-muted-foreground">{health.data?.version ?? "—"}</span>
        </Row>
        <Row title={t("settings.about.vault")}>
          <span title={vault} className="max-w-[42ch] truncate font-mono text-[11px] text-muted-foreground max-sm:max-w-[52vw]">
            {vault ?? t("nav.vaultUnavailable")}
          </span>
          {vault ? <CopyButton value={vault} /> : null}
        </Row>
        <div className="flex flex-col">
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
            >
              {link.label}
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </a>
          ))}
        </div>
      </Rows>
    </Section>
  );
}

export function SettingsPage() {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const requested = params.get("section");
  const active: SectionId = isSection(requested) ? requested : "general";
  const reduce = useReducedMotion();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (next: SectionId) => {
    setParams(next === "general" ? {} : { section: next }, { replace: true });
  };

  const onNavKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = (index + step + SECTIONS.length) % SECTIONS.length;
    const target = SECTIONS[next];
    if (!target) return;
    select(target);
    buttons.current[next]?.focus();
  };

  return (
    <Page className={PAGE_SECTIONS}>
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="max-w-[68ch] text-sm text-muted-foreground">{t("settings.description")}</p>
      </div>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-10">
        <nav aria-label={t("settings.sections")} className="lg:sticky lg:top-4 lg:self-start">
          <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {SECTIONS.map((section, index) => {
              const current = section === active;
              return (
                <li key={section} className="shrink-0">
                  <button
                    type="button"
                    ref={(element) => {
                      buttons.current[index] = element;
                    }}
                    aria-current={current ? "true" : undefined}
                    onClick={() => select(section)}
                    onKeyDown={(event) => onNavKeyDown(event, index)}
                    className={cn(
                      "w-full rounded-full px-3 py-1.5 text-left text-sm whitespace-nowrap transition-colors lg:whitespace-normal",
                      "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                      current ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {t(SECTION_LABEL[section])}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: reduce ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
            className="min-w-0"
          >
            {active === "general" ? <GeneralSection /> : null}
            {active === "startup" ? (
              <DesktopOnlySection id="startup" description={t("settings.startup.description")} body={t("settings.startup.desktop")} />
            ) : null}
            {active === "agents" ? <AgentsSection /> : null}
            {active === "search" ? <SearchSection /> : null}
            {active === "updates" ? (
              <DesktopOnlySection id="updates" description={t("settings.updates.description")} body={t("settings.updates.desktop")} />
            ) : null}
            {active === "about" ? <AboutSection /> : null}
          </motion.div>
        </div>
      </div>
    </Page>
  );
}
