import { Command, FolderKanban, House, Inbox, LayoutList, Sparkles, Waypoints } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState } from "react";
import { Link, useLocation, useOutlet } from "react-router";
import { AppCommandPalette } from "@/components/app/command-palette";
import { Logo } from "@/components/app/logo";
import { NewNoteDialog } from "@/components/app/new-note-dialog";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { AnimatedToastStack } from "@/components/motion/animated-toast-stack";
import { Dock, DockItem, DockSeparator } from "@/components/motion/dock";
import { Tabs, TabsList, TabsTrigger } from "@/components/motion/tabs";
import { ThemeToggle } from "@/components/motion/theme-toggle";
import { Tooltip } from "@/components/motion/tooltip";
import { PAGE_GUTTERS } from "@/components/page";
import { type TranslationKey, useI18n } from "@/i18n";
import { EASE_OUT } from "@/lib/ease";
import { useHealth, useInbox } from "@/lib/queries";
import { useGlobalShortcuts } from "@/lib/shortcuts";
import { dismissToast, useToasts } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface DockLink {
  to: string;
  labelKey: TranslationKey;
  icon: typeof House;
  shortcut: string;
}

const dockLinks: DockLink[] = [
  { to: "/", labelKey: "nav.home", icon: House, shortcut: "H" },
  { to: "/explore", labelKey: "nav.explore", icon: LayoutList, shortcut: "E" },
  { to: "/projects", labelKey: "nav.projects", icon: FolderKanban, shortcut: "P" },
  { to: "/graph", labelKey: "nav.graph", icon: Waypoints, shortcut: "G" },
  { to: "/inbox", labelKey: "nav.inbox", icon: Inbox, shortcut: "I" },
  { to: "/recommend", labelKey: "nav.recommend", icon: Sparkles, shortcut: "R" },
];

const DOCK_HEIGHT = 54;
/** Bottom space content keeps clear of the floating Dock. */
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

export function Layout() {
  const { t, language, setLanguage } = useI18n();
  const location = useLocation();
  const outlet = useOutlet();
  const reduce = useReducedMotion();
  const health = useHealth();
  const inbox = useInbox();
  const toasts = useToasts();
  const pending = inbox.data?.length ?? 0;
  const vault = health.data?.vault;
  const folder = vaultName(vault);
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);

  useGlobalShortcuts();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header
        className={cn(
          "sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-3 bg-background",
          PAGE_GUTTERS,
          "border-b transition-colors",
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

        <div className="flex shrink-0 items-center gap-2">
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
            {outlet}
          </motion.div>
        </AnimatePresence>
      </main>

      <nav aria-label={t("nav.primary")} className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2">
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
                    <span className="flex items-center gap-2">
                      <span>{t(item.labelKey)}</span>
                      <kbd className="rounded-full border border-border px-1.5 font-mono text-[10px] text-muted-foreground">
                        {t("shortcuts.sequence", { key: item.shortcut })}
                      </kbd>
                    </span>
                  }
                >
                  <Link
                    to={item.to}
                    aria-label={t(item.labelKey)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative grid size-full place-items-center rounded-full text-muted-foreground transition-colors",
                      "hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      active && "text-foreground",
                    )}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                    {item.to === "/inbox" && pending > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                        <AnimatedNumber value={pending} startOnView={false} duration={0.5} />
                      </span>
                    )}
                  </Link>
                </Tooltip>
              </DockItem>
            );
          })}
          <DockSeparator />
          <DockItem>
            <Tooltip
              side="top"
              sideOffset={10}
              content={
                <span className="flex items-center gap-2">
                  <span>{t("nav.palette")}</span>
                  <kbd className="rounded-full border border-border px-1.5 font-mono text-[10px] text-muted-foreground">⌘K</kbd>
                </span>
              }
            >
              <button
                type="button"
                aria-label={t("nav.palette")}
                onClick={() => window.dispatchEvent(new Event("basics:open-palette"))}
                className="grid size-full place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <Command className="size-4" aria-hidden="true" />
              </button>
            </Tooltip>
          </DockItem>
        </Dock>
      </nav>

      <AnimatedToastStack toasts={toasts} onDismiss={dismissToast} position="bottom-right" fixed />
      <AppCommandPalette />
      <NewNoteDialog />
    </div>
  );
}
