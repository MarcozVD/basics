import { Command, FolderKanban, House, Inbox, LayoutList, Puzzle, Settings, Sparkles, Waypoints } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  type Location,
  type NavigationType,
  UNSAFE_LocationContext,
  useLocation,
  useNavigate,
  useNavigationType,
  useOutlet,
} from "react-router";
import { AppCommandPalette } from "@/components/app/command-palette";
import { Logo } from "@/components/app/logo";
import { NewNoteDialog } from "@/components/app/new-note-dialog";
import { UpdateBanner } from "@/components/app/update-banner";
import { WindowControls } from "@/components/app/window-controls";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { AnimatedToastStack } from "@/components/motion/animated-toast-stack";
import { Dock, DockItem, DockSeparator } from "@/components/motion/dock";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { Tooltip } from "@/components/motion/tooltip";
import { PAGE_GUTTERS } from "@/components/page";
import { type TranslationKey, useI18n } from "@/i18n";
import { isAgentRunActive, useAgentRunStatus } from "@/lib/agent-run";
import { isDesktop, isMacos } from "@/lib/desktop";
import { PALETTE_SEARCH_EVENT, useDesktopShell } from "@/lib/desktop-shell";
import { EASE_OUT } from "@/lib/ease";
import { useHealth, useInbox } from "@/lib/queries";
import { useGlobalShortcuts } from "@/lib/shortcuts";
import { dismissToast, toast, useToasts } from "@/lib/toast";
import { startUpdater } from "@/lib/updater";
import { cn } from "@/lib/utils";

interface DockLink {
  to: string;
  labelKey: TranslationKey;
  /** One line under the label: what the page is for. */
  purposeKey: TranslationKey;
  icon: typeof House;
  shortcut: string;
}

const dockLinks: DockLink[] = [
  { to: "/", labelKey: "nav.home", purposeKey: "nav.home.purpose", icon: House, shortcut: "H" },
  { to: "/explore", labelKey: "nav.explore", purposeKey: "nav.explore.purpose", icon: LayoutList, shortcut: "E" },
  { to: "/projects", labelKey: "nav.projects", purposeKey: "nav.projects.purpose", icon: FolderKanban, shortcut: "P" },
  { to: "/graph", labelKey: "nav.graph", purposeKey: "nav.graph.purpose", icon: Waypoints, shortcut: "G" },
  { to: "/inbox", labelKey: "nav.inbox", purposeKey: "nav.inbox.purpose", icon: Inbox, shortcut: "I" },
  { to: "/recommend", labelKey: "nav.recommend", purposeKey: "nav.recommend.purpose", icon: Sparkles, shortcut: "R" },
  { to: "/skills", labelKey: "nav.skills", purposeKey: "nav.skills.purpose", icon: Puzzle, shortcut: "K" },
];

/**
 * Caption under a Dock icon. Readable sizes only: 10px from `sm`, 9px from 480px,
 * and hidden below that — the icon alone plus its tooltip beats a 7px label.
 * Labels stay whole (a long one is a couple of px wider than its item and centres
 * over the gap) because an ellipsis on the only word that names the page reads worse.
 */
const dockLabelClass =
  "hidden shrink-0 text-center whitespace-nowrap text-[9px] leading-none font-medium tracking-tight min-[480px]:inline sm:text-[10px]";

/** Height of the floating Dock itself: item height plus its padding and border. */
export const DOCK_HEIGHT = 58;
/** The Dock floats this far off the bottom edge (`bottom-4`). */
export const DOCK_OFFSET = 16;
/**
 * Bottom clearance every page keeps when scrolled to the end: the Dock's height
 * plus 24px of breathing room (`DOCK_HEIGHT + 24`). `<main>` reserves it as
 * bottom padding and scroll padding; fixed-height panels subtract it so their
 * last row never lands under the Dock.
 */
export const DOCK_SPACE = DOCK_HEIGHT + 24;
/** Room for a page's own sticky header (editor breadcrumb bar) when focus scrolls content up. */
const STICKY_SPACE = 64;

/** Dock item is active for its own route and for routes that belong to it. */
function isDockActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  if (pathname === to || pathname.startsWith(`${to}/`)) return true;
  return to === "/explore" && pathname.startsWith("/notes/");
}

function vaultName(vault: string | undefined): string | undefined {
  if (!vault) return undefined;
  const segments = vault.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? vault;
}

/**
 * The outlet rendered with the location it was created for. `AnimatePresence` keeps the
 * outgoing page mounted while it fades out; without this snapshot that page keeps reading the
 * live router location, so `useSearchParams()` sees the *new* route's empty params and a
 * filtered Explore (or any page keyed by query params) renders "All" for the length of the
 * transition. Freezing the location context makes the exiting page render as it last did.
 */
const PageFrame = memo(function PageFrame({
  location,
  navigationType,
  outlet,
}: {
  location: Location;
  navigationType: NavigationType;
  outlet: ReactNode;
}) {
  const value = useMemo(() => ({ location, navigationType }), [location, navigationType]);
  return <UNSAFE_LocationContext.Provider value={value}>{outlet}</UNSAFE_LocationContext.Provider>;
});

export function Layout() {
  const { t, language, setLanguage } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const outlet = useOutlet();
  const agentStatus = useAgentRunStatus();
  const agentRunning = isAgentRunActive(agentStatus);
  const onRecommend = location.pathname === "/recommend";
  const reduce = useReducedMotion();
  const health = useHealth();
  const inbox = useInbox();
  const toasts = useToasts();
  const pending = inbox.data?.length ?? 0;
  const vault = health.data?.vault;
  const folder = vaultName(vault);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  // Window chrome is the app's own only inside the desktop app; a browser keeps its
  // native title bar, find bar and reload. `isDesktop()` never changes for a page.
  const desktop = useMemo(() => isDesktop(), []);
  const mac = useMemo(() => desktop && isMacos(), [desktop]);
  const settingsKey = useMemo(() => (isMacos() ? "⌘," : "Ctrl+,"), []);

  useGlobalShortcuts();
  // No browser behaviour in the app: Ctrl+F searches here, reload/print/source/zoom/…
  // are swallowed, and the native context menu only survives in editable fields.
  useDesktopShell(desktop);

  // One background update check per app session, after the page has settled: the server is
  // already healthy by the time the UI loads, and a slow check never blocks anything.
  useEffect(() => {
    if (desktop) startUpdater();
  }, [desktop]);

  // A run started from Recommend keeps going while the user is elsewhere: announce it when it
  // finishes (the panel already shows the answer when it is on screen) and offer to go back.
  const lastAgentStatus = useRef(agentStatus);
  useEffect(() => {
    const wasRunning = isAgentRunActive(lastAgentStatus.current);
    lastAgentStatus.current = agentStatus;
    if (!wasRunning || agentStatus !== "done" || onRecommend) return;
    toast.success(t("recommend.agent.ready"), {
      label: t("recommend.agent.readyAction"),
      onClick: () => navigate("/recommend"),
    });
  }, [agentStatus, onRecommend, navigate, t]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header
        // In the desktop app the whole header drags the window (double-click maximizes);
        // a browser gets no drag attribute, so nothing changes there.
        data-tauri-drag-region={desktop ? "deep" : undefined}
        className={cn(
          "sticky top-0 z-30 flex shrink-0 items-center justify-between gap-3 border-b bg-background transition-colors",
          desktop ? cn("h-12 select-none py-0 pr-0", mac ? "pl-[76px]" : "pl-page-gutter") : cn("py-4", PAGE_GUTTERS),
          scrolled ? "border-border" : "border-transparent",
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span data-testid="brand-logo" className="shrink-0">
            <Logo size={28} />
          </span>
          <Link
            to="/"
            className="rounded-full text-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("app.name")}
          </Link>
          <span aria-hidden="true" className="text-muted-foreground/60">
            /
          </span>
          <Tooltip
            content={vault ?? t("nav.vaultUnavailable")}
            side="bottom"
            align="start"
            className="max-w-80 font-mono text-[11px] break-all"
          >
            <span className="max-w-[220px] truncate font-mono text-[11px] text-muted-foreground">
              {folder ?? t("nav.vaultUnavailable")}
            </span>
          </Tooltip>
        </div>

        <div className={cn("flex shrink-0 items-center gap-2", desktop && "h-full self-stretch")}>
          <Tooltip
            side="bottom"
            content={
              <span className="flex items-center gap-2">
                <span>{t("nav.settings")}</span>
                <kbd className="rounded-full border border-border px-1.5 font-mono text-[10px] text-muted-foreground">{settingsKey}</kbd>
              </span>
            }
          >
            <Link
              to="/settings"
              aria-label={t("nav.settings")}
              aria-current={location.pathname === "/settings" ? "page" : undefined}
              className={cn(
                "grid size-8 place-items-center rounded-full text-muted-foreground transition-colors",
                "hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
                location.pathname === "/settings" && "text-foreground",
              )}
            >
              <Settings className="size-4" aria-hidden="true" />
            </Link>
          </Tooltip>
          <fieldset className="m-0 min-w-0 border-0 p-0" aria-label={t("nav.language")}>
            <Tabs value={language} onValueChange={(value) => setLanguage(value as "en" | "es")} variant="segment">
              <TabsList>
                {(["en", "es"] as const).map((option) => (
                  <TabsTrigger key={option} value={option} className="px-2.5 py-1 text-[11px] font-medium uppercase">
                    {option}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </fieldset>
          <ThemeToggle
            aria-label={t("nav.theme")}
            title={t("nav.theme")}
            className="size-8 rounded-full text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            iconClassName="size-4"
          />
          {desktop ? <WindowControls /> : null}
        </div>
      </header>

      <main
        ref={scrollRef}
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 0)}
        // Keyboard focus and scrollIntoView keep targets clear of the floating Dock and of sticky page headers.
        style={{ paddingBottom: DOCK_SPACE, scrollPaddingBottom: DOCK_SPACE, scrollPaddingTop: STICKY_SPACE }}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            className="min-h-full"
          >
            <PageFrame location={location} navigationType={navigationType} outlet={outlet} />
          </motion.div>
        </AnimatePresence>
      </main>

      <nav aria-label={t("nav.primary")} className={cn("fixed bottom-4 left-1/2 z-40 -translate-x-1/2", desktop && "select-none")}>
        <span className="sr-only">{t("shortcuts.help")}</span>
        <Dock className="shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
          {dockLinks.map((item) => {
            const Icon = item.icon;
            const active = isDockActive(location.pathname, item.to);
            return (
              <DockItem key={item.to} active={active}>
                <Tooltip
                  side="top"
                  sideOffset={10}
                  content={
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-2">
                        <span>{t(item.labelKey)}</span>
                        <kbd className="rounded-full border border-border px-1.5 font-mono text-[10px] text-muted-foreground">
                          {t("shortcuts.sequence", { key: item.shortcut })}
                        </kbd>
                      </span>
                      <span className="max-w-56 text-[11px] leading-4 font-normal text-muted-foreground">{t(item.purposeKey)}</span>
                    </span>
                  }
                >
                  <Link
                    to={item.to}
                    aria-label={t(item.labelKey)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex size-full flex-col items-center justify-center gap-0.5 rounded-full px-0.5 text-muted-foreground transition-colors",
                      "hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      active && "text-foreground",
                    )}
                  >
                    <Icon className="size-[18px] shrink-0 sm:size-5" aria-hidden="true" />
                    <span aria-hidden="true" className={cn(dockLabelClass, active ? "text-foreground" : "text-muted-foreground")}>
                      {t(item.labelKey)}
                    </span>
                    {item.to === "/inbox" && pending > 0 && (
                      <span className="absolute top-0 right-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        <AnimatedNumber value={pending} startOnView={false} duration={0.5} />
                      </span>
                    )}
                    {item.to === "/recommend" && agentRunning && !onRecommend && (
                      <span
                        aria-hidden="true"
                        className="absolute top-0 right-1 size-2 rounded-full bg-primary motion-safe:animate-pulse"
                      />
                    )}
                  </Link>
                </Tooltip>
                {item.to === "/recommend" && agentRunning ? <span className="sr-only">{t("recommend.agent.runningBadge")}</span> : null}
              </DockItem>
            );
          })}
          <DockSeparator />
          <DockItem>
            <Tooltip
              side="top"
              sideOffset={10}
              content={
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span>{t("nav.palette")}</span>
                    <kbd className="rounded-full border border-border px-1.5 font-mono text-[10px] text-muted-foreground">
                      {t("shortcuts.palette")}
                    </kbd>
                  </span>
                  <span className="max-w-56 text-[11px] leading-4 font-normal text-muted-foreground">{t("nav.palette.purpose")}</span>
                </span>
              }
            >
              <button
                type="button"
                aria-label={t("nav.palette")}
                onClick={() => window.dispatchEvent(new Event(PALETTE_SEARCH_EVENT))}
                className="relative flex size-full flex-col items-center justify-center gap-0.5 rounded-full px-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Command className="size-[17px] shrink-0 sm:size-[18px]" aria-hidden="true" />
                <span aria-hidden="true" className={dockLabelClass}>
                  {t("nav.paletteShort")}
                </span>
              </button>
            </Tooltip>
          </DockItem>
        </Dock>
      </nav>

      <AnimatedToastStack toasts={toasts} onDismiss={dismissToast} position="bottom-right" fixed />
      <UpdateBanner />
      <AppCommandPalette />
      <NewNoteDialog />
    </div>
  );
}
