import { useQueryClient } from "@tanstack/react-query";
import {
  FolderKanban,
  House,
  Inbox,
  LayoutList,
  PanelLeftClose,
  PanelLeftOpen,
  Puzzle,
  Search,
  Settings,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useId, useState } from "react";
import { Link, useLocation } from "react-router";
import { Logo } from "@/components/app/logo";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Tooltip } from "@/components/motion/tooltip";
import { type TranslationKey, useI18n } from "@/i18n";
import { isAgentRunActive, useAgentRunStatus } from "@/lib/agent-run";
import { isDesktop, isMacos, modChord } from "@/lib/desktop";
import { PALETTE_SEARCH_EVENT } from "@/lib/desktop-shell";
import { SPRING_LAYOUT } from "@/lib/ease";
import { prefetchRoute } from "@/lib/prefetch";
import { useHealth, useInbox } from "@/lib/queries";
import { cn } from "@/lib/utils";

export interface NavLink {
  to: string;
  labelKey: TranslationKey;
  /** One line under the label: what the page is for. */
  purposeKey?: TranslationKey;
  icon: typeof House;
  /** Single-key route in the `G then <key>` sequence, or a modifier chord for Settings. */
  shortcut?: string;
  /** Show the chord verbatim (`⌘,`) instead of `G then <key>`. */
  chord?: boolean;
}

/** Primary routes, in the sidebar's order. Detail routes belong to their parent. */
export const NAV_LINKS: NavLink[] = [
  { to: "/", labelKey: "nav.home", purposeKey: "nav.home.purpose", icon: House, shortcut: "H" },
  { to: "/explore", labelKey: "nav.explore", purposeKey: "nav.explore.purpose", icon: LayoutList, shortcut: "E" },
  { to: "/projects", labelKey: "nav.projects", purposeKey: "nav.projects.purpose", icon: FolderKanban, shortcut: "P" },
  { to: "/graph", labelKey: "nav.graph", purposeKey: "nav.graph.purpose", icon: Waypoints, shortcut: "G" },
  { to: "/inbox", labelKey: "nav.inbox", purposeKey: "nav.inbox.purpose", icon: Inbox, shortcut: "I" },
  { to: "/recommend", labelKey: "nav.recommend", purposeKey: "nav.recommend.purpose", icon: Sparkles, shortcut: "R" },
  { to: "/skills", labelKey: "nav.skills", purposeKey: "nav.skills.purpose", icon: Puzzle, shortcut: "K" },
];

export const SETTINGS_LINK: NavLink = { to: "/settings", labelKey: "nav.settings", icon: Settings, shortcut: ",", chord: true };

/** Expanded width on wide windows. */
export const SIDEBAR_EXPANDED = 224;
/** Icon-only rail between 768 and 1279px. */
export const SIDEBAR_RAIL = 64;
/** The explicit collapse choice. Absent means "follow the width". */
export const SIDEBAR_KEY = "basics:sidebar";

/** True for the item's own route and for routes that belong to it. */
export function isNavActive(pathname: string, to: string): boolean {
  if (to === "/") return pathname === "/";
  if (pathname === to || pathname.startsWith(`${to}/`)) return true;
  return to === "/explore" && pathname.startsWith("/notes/");
}

function vaultName(vault: string | undefined): string | undefined {
  if (!vault) return undefined;
  const segments = vault.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? vault;
}

function readSidebarChoice(): boolean | null {
  try {
    const value = localStorage.getItem(SIDEBAR_KEY);
    if (value === "collapsed") return true;
    if (value === "expanded") return false;
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
  return null;
}

/** Live media query, initialised synchronously so the first paint has the right width. */
function useMedia(query: string): boolean {
  const [matches, setMatches] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

function shortcutLabel(item: NavLink): string | undefined {
  if (!item.shortcut) return undefined;
  return item.chord ? modChord(item.shortcut) : item.shortcut;
}

interface NavItemProps {
  item: NavLink;
  active: boolean;
  collapsed: boolean;
  pending: number;
  agentRunning: boolean;
  layoutId: string;
  onNavigate?: () => void;
}

function NavItem({ item, active, collapsed, pending, agentRunning, layoutId, onNavigate }: NavItemProps) {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const Icon = item.icon;
  const shortcut = shortcutLabel(item);
  const showCount = item.to === "/inbox" && pending > 0;
  const showAgent = item.to === "/recommend" && agentRunning && !active;
  const queryClient = useQueryClient();
  // Hover, keyboard focus and touch all warm the same route: chunk plus first-paint queries.
  const warm = () => prefetchRoute(item.to, queryClient);

  const link = (
    <Link
      to={item.to}
      onClick={onNavigate}
      onPointerEnter={warm}
      onPointerDown={warm}
      onFocus={warm}
      aria-label={t(item.labelKey)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex h-9 min-w-0 items-center gap-3 rounded-lg text-sm text-muted-foreground transition-colors",
        "hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        collapsed ? "justify-center px-0" : "px-3",
        active && "text-foreground",
      )}
    >
      {active ? (
        <motion.span
          layoutId={layoutId}
          transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
          className="absolute inset-0 -z-10 rounded-lg bg-card ring-1 ring-border/70"
        />
      ) : null}
      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
      {collapsed ? null : <span className="min-w-0 flex-1 truncate whitespace-nowrap">{t(item.labelKey)}</span>}
      {showCount && collapsed ? (
        <span className="absolute top-0.5 right-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
          <AnimatedNumber value={pending} startOnView={false} duration={0.5} />
        </span>
      ) : null}
      {showCount && !collapsed ? (
        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 font-mono text-[10px] font-semibold text-primary-foreground">
          <AnimatedNumber value={pending} startOnView={false} duration={0.5} />
        </span>
      ) : null}
      {showAgent ? (
        <span aria-hidden="true" className="absolute top-1 right-1 size-2 rounded-full bg-primary motion-safe:animate-pulse" />
      ) : null}
    </Link>
  );

  if (!collapsed) {
    return (
      <>
        {link}
        {item.to === "/recommend" && agentRunning ? <span className="sr-only">{t("recommend.agent.runningBadge")}</span> : null}
      </>
    );
  }

  return (
    <Tooltip
      side="right"
      sideOffset={10}
      content={
        <span className="flex flex-col gap-1">
          <span className="flex items-center gap-2">
            <span>{t(item.labelKey)}</span>
            {shortcut ? (
              <kbd className="rounded-full border border-border px-1.5 font-mono text-[10px] text-muted-foreground">
                {item.chord ? shortcut : t("shortcuts.sequence", { key: shortcut })}
              </kbd>
            ) : null}
          </span>
          {item.purposeKey ? (
            <span className="max-w-56 text-[11px] leading-4 font-normal text-muted-foreground">{t(item.purposeKey)}</span>
          ) : null}
        </span>
      }
    >
      {link}
      {item.to === "/recommend" && agentRunning ? <span className="sr-only">{t("recommend.agent.runningBadge")}</span> : null}
    </Tooltip>
  );
}

interface SidebarNavProps {
  collapsed: boolean;
  /** Closes the drawer after a navigation (mobile). */
  onNavigate?: () => void;
  /** The static sidebar owns the collapse toggle; the drawer does not. */
  onToggle?: () => void;
  /** Desktop app: the top block drags the window. */
  draggable?: boolean;
  /** macOS desktop: leave room for the traffic lights. */
  mac?: boolean;
}

/** Everything inside the sidebar (or the mobile drawer): brand, search, routes, Settings. */
export function SidebarNav({ collapsed, onNavigate, onToggle, draggable, mac }: SidebarNavProps) {
  const { t } = useI18n();
  const location = useLocation();
  const health = useHealth();
  const inbox = useInbox();
  const agentStatus = useAgentRunStatus();
  const pending = inbox.data?.length ?? 0;
  const agentRunning = isAgentRunActive(agentStatus);
  const vault = health.data?.vault;
  const folder = vaultName(vault);
  const pillId = useId();
  const layoutId = `sidebar-pill-${pillId}`;

  const openPalette = () => window.dispatchEvent(new Event(PALETTE_SEARCH_EVENT));

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", mac && "pt-8")}>
      <div className={cn("flex flex-col gap-2", collapsed ? "px-2 pt-3" : "px-3 pt-3")}>
        <div
          data-tauri-drag-region={draggable ? "deep" : undefined}
          className={cn("flex min-w-0 items-center gap-2", collapsed && "justify-center", draggable && "select-none")}
        >
          <span data-testid="brand-logo" className="shrink-0">
            <Logo size={28} />
          </span>
          {collapsed ? null : (
            <Link
              to="/"
              onClick={onNavigate}
              className="min-w-0 truncate rounded-full text-sm font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {t("app.name")}
            </Link>
          )}
        </div>

        {collapsed ? null : (
          <Tooltip
            content={vault ?? t("nav.vaultUnavailable")}
            side="bottom"
            align="start"
            className="max-w-80 font-mono text-[11px] break-all"
          >
            <span className="w-full truncate font-mono text-[11px] text-muted-foreground">{folder ?? t("nav.vaultUnavailable")}</span>
          </Tooltip>
        )}

        <Tooltip
          side="right"
          sideOffset={10}
          disabled={!collapsed}
          content={
            <span className="flex flex-col gap-1">
              <span className="flex items-center gap-2">
                <span>{t("nav.search")}</span>
                <kbd className="rounded-full border border-border px-1.5 font-mono text-[10px] text-muted-foreground">{modChord("K")}</kbd>
              </span>
              <span className="max-w-56 text-[11px] leading-4 font-normal text-muted-foreground">{t("nav.palette.purpose")}</span>
            </span>
          }
        >
          <button
            type="button"
            data-testid="sidebar-search"
            onClick={openPalette}
            aria-label={collapsed ? t("nav.palette") : undefined}
            className={cn(
              "flex h-8 min-w-0 items-center gap-2 rounded-lg border border-border bg-card/60 text-muted-foreground transition-colors",
              "hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
              collapsed ? "justify-center px-0" : "px-2",
            )}
          >
            <Search className="size-4 shrink-0" aria-hidden="true" />
            {collapsed ? null : (
              <>
                <span className="min-w-0 flex-1 truncate text-left text-xs whitespace-nowrap">{t("nav.search")}</span>
                <kbd className="shrink-0 rounded-full border border-border px-1.5 font-mono text-[10px] leading-4 text-muted-foreground">
                  {modChord("K")}
                </kbd>
              </>
            )}
          </button>
        </Tooltip>
      </div>

      <nav
        aria-label={t("nav.primary")}
        className={cn("mt-3 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-contain", collapsed ? "px-2" : "px-3")}
      >
        {NAV_LINKS.map((item) => (
          <NavItem
            key={item.to}
            item={item}
            active={isNavActive(location.pathname, item.to)}
            collapsed={collapsed}
            pending={pending}
            agentRunning={agentRunning}
            layoutId={layoutId}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className={cn("mt-2 flex flex-col gap-0.5 border-t border-border/60 pt-2", collapsed ? "px-2 pb-3" : "px-3 pb-3")}>
        <NavItem
          item={SETTINGS_LINK}
          active={isNavActive(location.pathname, SETTINGS_LINK.to)}
          collapsed={collapsed}
          pending={pending}
          agentRunning={agentRunning}
          layoutId={layoutId}
          onNavigate={onNavigate}
        />
        {onToggle ? (
          <Tooltip side="right" sideOffset={10} disabled={!collapsed} content={<span>{t(collapsed ? "nav.expand" : "nav.collapse")}</span>}>
            <button
              type="button"
              data-testid="sidebar-toggle"
              aria-label={t(collapsed ? "nav.expand" : "nav.collapse")}
              onClick={onToggle}
              className={cn(
                "flex h-9 min-w-0 items-center gap-3 rounded-lg text-sm text-muted-foreground transition-colors",
                "hover:text-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                collapsed ? "justify-center px-0" : "px-3",
              )}
            >
              {collapsed ? (
                <PanelLeftOpen className="size-[18px] shrink-0" aria-hidden="true" />
              ) : (
                <>
                  <PanelLeftClose className="size-[18px] shrink-0" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-left whitespace-nowrap">{t("nav.collapse")}</span>
                </>
              )}
            </button>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The app's navigation column. On wide windows it is expanded; between 768 and 1279px
 * it is an icon rail; below 768px the layout hides it and opens `SidebarNav` in a drawer.
 * An explicit collapse choice (toggle or Ctrl/Cmd+B) wins over the width default.
 */
export function Sidebar({ hidden = false }: { hidden?: boolean }) {
  const reduce = useReducedMotion();
  const wide = useMedia("(min-width: 1280px)");
  const [choice, setChoice] = useState<boolean | null>(readSidebarChoice);
  const collapsed = choice ?? !wide;
  const desktop = useMemoOnce(() => isDesktop());
  const mac = useMemoOnce(() => isDesktop() && isMacos());

  const setCollapsed = useCallback((next: boolean) => {
    setChoice(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? "collapsed" : "expanded");
    } catch {
      // Private mode: the choice still holds for this visit.
    }
  }, []);

  useEffect(() => {
    // Sidebar style only: the floating bar owns navigation while it is on.
    if (hidden) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key.toLowerCase() !== "b") return;
      event.preventDefault();
      setCollapsed(!collapsed);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [collapsed, setCollapsed, hidden]);

  return (
    <motion.aside
      data-testid="sidebar"
      initial={false}
      animate={{ width: hidden ? 0 : collapsed ? SIDEBAR_RAIL : SIDEBAR_EXPANDED, opacity: hidden ? 0 : 1 }}
      transition={{
        width: reduce ? { duration: 0 } : SPRING_LAYOUT,
        opacity: { duration: reduce ? 0 : 0.15 },
      }}
      inert={hidden || undefined}
      aria-hidden={hidden || undefined}
      className="relative z-20 flex h-full shrink-0 flex-col overflow-hidden bg-shell"
    >
      {/* The inner column keeps its width while the outer one animates, so labels never
          wrap as the navigation style changes. */}
      <div className="h-full shrink-0" style={{ width: collapsed ? SIDEBAR_RAIL : SIDEBAR_EXPANDED }}>
        <SidebarNav collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} draggable={desktop} mac={mac} />
      </div>
    </motion.aside>
  );
}

/** `useMemo` with no dependencies: a value that never changes for the life of the page. */
function useMemoOnce<T>(factory: () => T): T {
  const [value] = useState(factory);
  return value;
}
