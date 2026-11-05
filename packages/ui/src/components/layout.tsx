import { Menu } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  type Location,
  type NavigationType,
  UNSAFE_LocationContext,
  useLocation,
  useNavigate,
  useNavigationType,
  useOutlet,
} from "react-router";
import { AppCommandPalette } from "@/components/app/command-palette";
import { NewNoteDialog } from "@/components/app/new-note-dialog";
import { Sidebar, SidebarNav } from "@/components/app/sidebar";
import { UpdateBanner } from "@/components/app/update-banner";
import { WindowControls } from "@/components/app/window-controls";
import { AnimatedToastStack } from "@/components/motion/animated-toast-stack";
import { Drawer } from "@/components/motion/drawer";
import { useI18n } from "@/i18n";
import { isAgentRunActive, useAgentRunStatus } from "@/lib/agent-run";
import { isDesktop, isMacos } from "@/lib/desktop";
import { useDesktopShell } from "@/lib/desktop-shell";
import { EASE_OUT } from "@/lib/ease";
import { useGlobalShortcuts } from "@/lib/shortcuts";
import { dismissToast, toast, useToasts } from "@/lib/toast";
import { startUpdater } from "@/lib/updater";

/** Below this the sidebar hides behind a menu button and opens in a drawer. */
const MOBILE_QUERY = "(max-width: 767px)";
/** Room for a page's own sticky header when focus scrolls content up inside the panel. */
const STICKY_SPACE = 64;

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

/** Live media query, initialised synchronously so the first paint has the right layout. */
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

export function Layout() {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const navigationType = useNavigationType();
  const outlet = useOutlet();
  const agentStatus = useAgentRunStatus();
  const onRecommend = location.pathname === "/recommend";
  const reduce = useReducedMotion();
  const toasts = useToasts();
  const scrollRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const mobile = useMedia(MOBILE_QUERY);
  // Window chrome is the app's own only inside the desktop app; a browser keeps its
  // native title bar, find bar and reload. `isDesktop()` never changes for a page.
  const desktop = useMemo(() => isDesktop(), []);
  const mac = useMemo(() => desktop && isMacos(), [desktop]);

  useGlobalShortcuts();
  // No browser behaviour in the app: Ctrl+F searches here, reload/print/source/zoom/...
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

  // The drawer is a mobile-only affordance: closing it the moment the shell is wide again
  // avoids a `body` scroll lock surviving a resize.
  useEffect(() => {
    if (!mobile) setMenuOpen(false);
  }, [mobile]);

  return (
    <div className="flex h-dvh overflow-hidden bg-shell text-foreground">
      {!mobile ? <Sidebar /> : null}

      <div className="relative flex min-w-0 flex-1 flex-col">
        {desktop ? (
          // Desktop app: a transparent 40px strip keeps the window draggable (double-click
          // maximizes) and the controls at the right, without costing a page any height in a
          // browser, which renders no strip at all.
          <div data-testid="title-strip" data-tauri-drag-region="deep" className="flex h-10 shrink-0 select-none items-center justify-end">
            <WindowControls />
          </div>
        ) : null}

        <div
          data-testid="content-panel"
          className="relative m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card"
        >
          <main
            ref={scrollRef}
            style={{ scrollPaddingBottom: 32, scrollPaddingTop: STICKY_SPACE }}
            className="min-h-0 flex-1 overflow-y-auto max-md:pt-12"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
                className="flex h-full flex-col"
              >
                <PageFrame location={location} navigationType={navigationType} outlet={outlet} />
              </motion.div>
            </AnimatePresence>
          </main>

          {mobile ? (
            <button
              type="button"
              data-testid="sidebar-menu"
              aria-label={t("nav.openMenu")}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
              className="absolute top-2 left-2 z-30 grid size-9 place-items-center rounded-lg border border-border bg-card/80 text-muted-foreground backdrop-blur transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Menu className="size-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <Drawer
        open={mobile && menuOpen}
        onOpenChange={setMenuOpen}
        side="left"
        ariaLabel={t("nav.primary")}
        className="w-72 max-w-[85vw] bg-shell"
      >
        <SidebarNav collapsed={false} onNavigate={() => setMenuOpen(false)} draggable={desktop} mac={mac} />
      </Drawer>

      {/* Above portalled popovers (`z-[9999]`): a toast action such as "Open" must stay
          clickable even while a dropdown is open over the panel corner. */}
      <AnimatedToastStack toasts={toasts} onDismiss={dismissToast} position="bottom-right" fixed className="z-[10000]" />
      <UpdateBanner />
      <AppCommandPalette />
      <NewNoteDialog />
    </div>
  );
}
