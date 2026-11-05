import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, ChevronDown, Copy, FolderOpen, MonitorSmartphone } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { Button } from "@/components/motion/button/base";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/motion/collapsible";
import { Switch } from "@/components/motion/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { PAGE_SECTIONS, Page } from "@/components/page";
import { ErrorState, Loading } from "@/components/state";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type TranslationKey, useI18n, useT } from "@/i18n";
import { agentColor, agentInitial } from "@/lib/agent-color";
import { type ConnectClientId, connectClients, disableEmbeddings, disconnectClients, enableEmbeddings, type Language } from "@/lib/api";
import {
  type CloseBehavior,
  chooseVaultFolder,
  type DesktopSettings,
  isDesktop,
  openVaultFolder,
  readDesktopSettings,
  type StartMinimized,
  writeDesktopSettings,
} from "@/lib/desktop";
import { useEmbeddingsProgress } from "@/lib/events";
import { queryKeys, useConnectStatus, useEmbeddings, useHealth } from "@/lib/queries";
import { type Theme, useTheme } from "@/lib/theme";
import { toast } from "@/lib/toast";
import { checkForUpdates, installUpdate, useUpdateState } from "@/lib/updater";
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
  releases: "https://github.com/MarcoZVD/basics/releases",
};

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

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
  return (
    <div className={cn("divide-y divide-border overflow-hidden rounded-2xl border border-border bg-muted/30", className)}>{children}</div>
  );
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

/**
 * A small set of mutually exclusive options. Native radios (one per option, one name)
 * give the correct semantics and arrow-key behaviour; the labels look like the segment
 * control the rest of the page uses.
 */
function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="m-0 min-w-0 border-0 p-0" aria-label={label}>
      <div className="inline-flex flex-wrap items-center gap-0 rounded-lg bg-muted/50 p-0.5">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label key={option.value} className="relative inline-flex cursor-pointer items-center">
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                disabled={disabled}
                onChange={() => onChange(option.value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded-md px-3 py-1 text-xs font-medium whitespace-nowrap transition-colors",
                  "peer-focus-visible:outline-2 peer-focus-visible:-outline-offset-2 peer-focus-visible:outline-ring",
                  selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  disabled && "cursor-not-allowed opacity-60",
                )}
              >
                {option.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
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
  // Vault actions exist only in the desktop app; in a browser the CLI hint below is all.
  const [confirmChange, setConfirmChange] = useState(false);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [vaultNote, setVaultNote] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);

  const changeLanguage = async (next: Language) => {
    setLanguageError(false);
    const ok = await setLanguage(next);
    if (ok) flashLanguage();
    else setLanguageError(true);
  };

  const openFolder = async () => {
    setVaultError(null);
    try {
      await openVaultFolder();
    } catch (cause) {
      setVaultError(errorText(cause));
    }
  };

  const changeFolder = async () => {
    setConfirmChange(false);
    setVaultBusy(true);
    setVaultError(null);
    setVaultNote(t("settings.vault.restarting"));
    try {
      const changed = await chooseVaultFolder();
      // A folder was picked: `basics init` recorded it and the app restarts the server,
      // which reloads this page. A dismissed picker leaves everything as it was.
      if (!changed) setVaultNote(null);
    } catch (cause) {
      setVaultError(errorText(cause));
      setVaultNote(null);
    } finally {
      setVaultBusy(false);
    }
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
        <Row title={t("settings.vault.title")} description={t("settings.vault.description")} vertical={desktop}>
          <div className="flex min-w-0 items-center gap-2">
            <span title={vault} className="max-w-[42ch] truncate font-mono text-[11px] text-muted-foreground max-sm:max-w-[52vw]">
              {vault ?? t("nav.vaultUnavailable")}
            </span>
            {vault ? <CopyButton value={vault} /> : null}
          </div>
          {desktop ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" disabled={!vault || vaultBusy} onClick={() => void openFolder()}>
                <FolderOpen className="size-3.5" aria-hidden="true" />
                {t("settings.vault.open")}
              </Button>
              <Button variant="secondary" size="sm" disabled={!vault || vaultBusy} onClick={() => setConfirmChange(true)}>
                {t("settings.vault.change")}
              </Button>
            </div>
          ) : null}
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

      {vaultNote && !vaultError ? (
        <p role="status" className="text-xs text-muted-foreground">
          {vaultNote}
        </p>
      ) : null}
      {vaultError ? (
        <p role="alert" className="text-xs text-destructive">
          {t("settings.vault.failed", { message: vaultError })}
        </p>
      ) : null}

      <Dialog open={confirmChange} onOpenChange={setConfirmChange}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t("settings.vault.changeTitle")}</DialogTitle>
            <DialogDescription>{t("settings.vault.changeBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmChange(false)}
              className="rounded-full border border-border px-4 py-1.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("settings.vault.changeCancel")}
            </button>
            <button
              type="button"
              onClick={() => void changeFolder()}
              className="rounded-full bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("settings.vault.changeConfirm")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Section>
  );
}

function DesktopOnlySection({ id, description, body }: { id: SectionId; description: string; body: string }) {
  const t = useT();
  const desktop = useMemo(() => isDesktop(), []);
  return (
    <Section id={id} title={t(`settings.${id}.title`)} description={description}>
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 px-4 py-4">
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

/**
 * Settings → Startup, desktop only. The values live in Rust (`desktop-settings.json`),
 * not in the browser, so they are read once when the section opens and every change is
 * written straight away: no Save button, `Saved` once Rust confirms, the previous value
 * restored if it refuses.
 */
function StartupSection() {
  const t = useT();
  const desktop = useMemo(() => isDesktop(), []);
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, flashSaved] = useSavedFlash();

  useEffect(() => {
    if (!desktop) return;
    let live = true;
    readDesktopSettings()
      .then((loaded) => {
        if (live) setSettings(loaded);
      })
      .catch((cause: unknown) => {
        if (live) setLoadError(errorText(cause));
      });
    return () => {
      live = false;
    };
  }, [desktop]);

  const save = async (patch: Partial<DesktopSettings>) => {
    if (!settings || pending) return;
    const before = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    setSaveError(null);
    setPending(true);
    try {
      // Rust answers with what it stored, which is also the live login-item state.
      setSettings(await writeDesktopSettings(next));
      flashSaved();
    } catch (cause) {
      setSettings(before);
      setSaveError(errorText(cause));
    } finally {
      setPending(false);
    }
  };

  if (!desktop) {
    return <DesktopOnlySection id="startup" description={t("settings.startup.description")} body={t("settings.startup.desktop")} />;
  }

  if (loadError) {
    return (
      <Section id="startup" title={t("settings.startup.title")} description={t("settings.startup.description")}>
        <ErrorState error={loadError} />
      </Section>
    );
  }

  return (
    <Section id="startup" title={t("settings.startup.title")} description={t("settings.startup.description")}>
      {settings ? (
        <Rows>
          <Row title={t("settings.startup.signIn.title")} description={t("settings.startup.signIn.description")}>
            <Switch
              checked={settings.startAtLogin}
              disabled={pending}
              ariaLabel={t("settings.startup.signIn.title")}
              onCheckedChange={(next) => void save({ startAtLogin: next })}
            />
          </Row>
          <Row title={t("settings.startup.minimized.title")} description={t("settings.startup.minimized.description")} vertical>
            <ChoiceGroup<StartMinimized>
              label={t("settings.startup.minimized.title")}
              value={settings.startMinimized}
              disabled={pending}
              onChange={(next) => void save({ startMinimized: next })}
              options={[
                { value: "never", label: t("settings.startup.minimized.never") },
                { value: "login", label: t("settings.startup.minimized.login") },
                { value: "always", label: t("settings.startup.minimized.always") },
              ]}
            />
          </Row>
          <Row title={t("settings.startup.closing.title")} description={t("settings.startup.closing.description")} vertical>
            <ChoiceGroup<CloseBehavior>
              label={t("settings.startup.closing.title")}
              value={settings.closeBehavior}
              disabled={pending}
              onChange={(next) => void save({ closeBehavior: next })}
              options={[
                { value: "tray", label: t("settings.startup.closing.tray") },
                { value: "quit", label: t("settings.startup.closing.quit") },
              ]}
            />
          </Row>
        </Rows>
      ) : (
        <Loading />
      )}

      {saveError ? (
        <p role="alert" className="text-xs text-destructive">
          {t("settings.startup.failed", { message: saveError })}
        </p>
      ) : null}
      <SavedHint visible={saved} />
    </Section>
  );
}

/**
 * Settings → Updates, desktop only. The version comes from the app (`desktop_version`, not
 * the server's health payload), the check runs through the two Rust commands, and the
 * "on start" switch lives in the same `desktop-settings.json` as the Startup section.
 */
function UpdatesSection() {
  const t = useT();
  const desktop = useMemo(() => isDesktop(), []);
  const health = useHealth();
  const update = useUpdateState();
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, flashSaved] = useSavedFlash();

  useEffect(() => {
    if (!desktop) return;
    let live = true;
    readDesktopSettings()
      .then((loaded) => {
        if (live) setSettings(loaded);
      })
      .catch((cause: unknown) => {
        if (live) setSettingsError(errorText(cause));
      });
    return () => {
      live = false;
    };
  }, [desktop]);

  if (!desktop) {
    return <DesktopOnlySection id="updates" description={t("settings.updates.description")} body={t("settings.updates.desktop")} />;
  }

  const saveCheckOnStart = async (next: boolean) => {
    if (!settings || saving) return;
    const before = settings;
    setSettings({ ...settings, checkUpdatesOnStart: next });
    setSettingsError(null);
    setSaving(true);
    try {
      setSettings(await writeDesktopSettings({ ...before, checkUpdatesOnStart: next }));
      flashSaved();
    } catch (cause) {
      setSettings(before);
      setSettingsError(errorText(cause));
    } finally {
      setSaving(false);
    }
  };

  const busy = update.phase === "checking" || update.phase === "downloading" || update.phase === "installing";
  const available = update.update;
  const status =
    update.phase === "checking"
      ? t("settings.updates.checking")
      : update.phase === "current"
        ? t("settings.updates.upToDate")
        : update.phase === "available"
          ? t("settings.updates.available", { version: available?.version ?? "" })
          : update.phase === "downloading"
            ? t("settings.updates.downloading")
            : update.phase === "installing"
              ? t("settings.updates.installing")
              : update.phase === "error"
                ? null
                : t("settings.updates.idle");

  return (
    <Section id="updates" title={t("settings.updates.title")} description={t("settings.updates.description")}>
      <Rows>
        <Row title={t("settings.updates.version")}>
          <span className="font-mono text-[11px] text-muted-foreground">{update.version ?? health.data?.version ?? "—"}</span>
        </Row>
        <Row title={t("settings.updates.check")} description={t("settings.updates.check.description")} vertical>
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <p role="status" className="text-xs text-muted-foreground">
              {status ?? t("settings.updates.failedShort")}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {available && update.phase === "available" ? (
                <Button size="sm" onClick={() => void installUpdate()}>
                  {t("settings.updates.update")}
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => void checkForUpdates()}>
                {update.phase === "checking" ? t("settings.updates.checking") : t("settings.updates.checkNow")}
              </Button>
            </div>
          </div>
        </Row>
        <Row
          title={t("settings.updates.onStart.title")}
          description={t("settings.updates.onStart.description")}
          status={<SavedHint visible={saved} />}
        >
          {settings ? (
            <Switch
              checked={settings.checkUpdatesOnStart}
              disabled={saving}
              ariaLabel={t("settings.updates.onStart.title")}
              onCheckedChange={(next) => void saveCheckOnStart(next)}
            />
          ) : (
            <Loading />
          )}
        </Row>
        <Row title={t("settings.updates.releases")} description={t("settings.updates.releases.description")}>
          <a
            href={LINKS.releases}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("settings.updates.openReleases")}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </Row>
      </Rows>

      {update.phase === "error" && update.error ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-xs text-destructive">
            {t("settings.updates.failed", { message: update.error })}
          </p>
          <Button variant="secondary" size="sm" onClick={() => void checkForUpdates()}>
            {t("updates.retry")}
          </Button>
        </div>
      ) : null}
      {settingsError ? (
        <p role="alert" className="text-xs text-destructive">
          {t("settings.updates.onStart.failed", { message: settingsError })}
        </p>
      ) : null}
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

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
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
            {active === "startup" ? <StartupSection /> : null}
            {active === "agents" ? <AgentsSection /> : null}
            {active === "search" ? <SearchSection /> : null}
            {active === "updates" ? <UpdatesSection /> : null}
            {active === "about" ? <AboutSection /> : null}
          </motion.div>
        </div>
      </div>
    </Page>
  );
}
