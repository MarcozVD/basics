import { Menu } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type CSSProperties, memo, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { FloatingNav } from "@/components/app/floating-nav";
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
import { EASE_IN, EASE_OUT } from "@/lib/ease";
import { DOCK_SPACE, DOCK_SPACE_VERTICAL, DOCK_VERTICAL_MIN, type DockEdge, setDockEdge, useNavigation } from "@/lib/navigation";
import { PAGE_ENTER_MS, PAGE_ENTER_OFFSET, PAGE_EXIT_MS, PAGE_EXIT_OFFSET, PAGE_REDUCED_MS, pageDirection } from "@/lib/page-transition";
import { useGlobalShortcuts } from "@/lib/shortcuts";
import { dismissToast, toast, useToasts } from "@/lib/toast";
import { startUpdater } from "@/lib/updater";
import { cn } from "@/lib/utils";

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
  epoch,
}: {
  location: Location;
  navigationType: NavigationType;
  outlet: ReactNode;
  epoch: number;
}) {
  const value = useMemo(() => ({ location, navigationType }), [location, navigationType]);
  // Returning to a route that is still exiting reuses the motion wrapper (same key)
  // but must not reuse the page's component state, or its query-param restore effect
  // sees the same pathname it left. The epoch only changes on a pathname change.
  return (
    <UNSAFE_LocationContext.Provider key={epoch} value={value}>
      {outlet}
    </UNSAFE_LocationContext.Provider>
  );
});

interface PageTransitionCustom {
  direction: 1 | -1;
  reduce: boolean;
}

/**
 * The shell is still; only the page moves. The outgoing page leaves 6px towards the
 * side the incoming page came from, over a short ease-in, while the incoming page
 * travels 12px from that side and settles with the shared ease-out. `popLayout`
 * mounts the new page immediately, so a second click never waits for the first exit.
 *
 * `popLayout` also pins the outgoing page out of the panel's scroll flow, so resetting
 * the shared scroll container for the incoming page cannot move the old content.
 */
const PAGE_VARIANTS = {
  enter: (custom: PageTransitionCustom) => ({
    opacity: 0,
    x: custom.reduce ? 0 : PAGE_ENTER_OFFSET * custom.direction,
    y: 0,
  }),
  center: { opacity: 1, x: 0, y: 0 },
  exit: (custom: PageTransitionCustom) => ({
    opacity: 0,
    x: custom.reduce ? 0 : -PAGE_EXIT_OFFSET * custom.direction,
    y: 0,
    transition: {
      duration: (custom.reduce ? PAGE_REDUCED_MS : PAGE_EXIT_MS) / 1000,
      ease: EASE_IN,
    },
  }),
};

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
  const reduced = Boolean(reduce);
  const toasts = useToasts();
  const scrollRef = useRef<HTMLElement>(null);
  // Navigation direction is derived during render, before the new page mounts, so the
  // entering page and the outgoing page resolve their variants from the same value.
  const lastPathRef = useRef(location.pathname);
  const directionRef = useRef<1 | -1>(1);
  // Returning to a route that is still exiting reuses its motion wrapper, so the page
  // component is remounted with this epoch to run its route-entry effects again.
  // Query-only changes keep the same epoch and do not replay the page transition.
  const pageEpochRef = useRef(0);
  if (location.pathname !== lastPathRef.current) {
    pageEpochRef.current += 1;
    directionRef.current = pageDirection(lastPathRef.current, location.pathname, navigationType);
    lastPathRef.current = location.pathname;
  }
  const pageKey = location.pathname;
  const transitionCustom: PageTransitionCustom = {
    direction: directionRef.current,
    reduce: reduced,
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const mobile = useMedia(MOBILE_QUERY);
  // Navigation style is local and applied without a reload. On a phone both styles use
  // the drawer, so the stored style returns when the window grows again.
  const navigation = useNavigation();
  const floating = navigation.style === "floating" && !mobile;
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(() => (typeof window === "undefined" ? 0 : window.innerHeight));
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const measure = () => setPanelHeight(panel.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, []);
  // A vertical bar needs a tall enough panel; otherwise it snaps to the bottom without
  // losing the remembered edge, so growing the window brings it back.
  const requestedEdge = navigation.edge;
  const edge: DockEdge =
    floating && (requestedEdge === "left" || requestedEdge === "right") && panelHeight < DOCK_VERTICAL_MIN ? "bottom" : requestedEdge;
  const navSpace = edge === "top" || edge === "bottom" ? DOCK_SPACE : DOCK_SPACE_VERTICAL;
  // Reserve the bar's edge with margins, not padding: pages size themselves to `main`
  // and overflow it, so padding would not stop content scrolling under the bar. Margins
  // shrink the scrollport itself, which guarantees nothing interactive lands beneath it.
  const mainStyle: CSSProperties = floating
    ? {
        marginTop: edge === "top" ? navSpace : undefined,
        marginRight: edge === "right" ? navSpace : undefined,
        marginBottom: edge === "bottom" ? navSpace : undefined,
        marginLeft: edge === "left" ? navSpace : undefined,
        scrollPaddingTop: edge === "top" ? navSpace : STICKY_SPACE,
        scrollPaddingRight: edge === "right" ? navSpace : undefined,
        scrollPaddingBottom: edge === "bottom" ? navSpace : 32,
        scrollPaddingLeft: edge === "left" ? navSpace : undefined,
        // The bar sits outside the scrollport (reserved by margin), so sticky headers
        // stick to a top that is already clear of it.
        ["--nav-top" as string]: "0px",
      }
    : { scrollPaddingBottom: 32, scrollPaddingTop: STICKY_SPACE, ["--nav-top" as string]: "0px" };
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

  // Every route starts at the top of the panel. The outgoing page is popped out of the
  // scroll flow by `AnimatePresence`, so this reset never moves content still on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the reset is keyed by route, not by the ref
  useLayoutEffect(() => {
    const main = scrollRef.current;
    if (main && main.scrollTop !== 0) main.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div className="flex h-dvh overflow-hidden bg-shell text-foreground">
      {!mobile ? <Sidebar hidden={floating} /> : null}

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
          ref={panelRef}
          data-testid="content-panel"
          className="relative m-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card"
        >
          <main ref={scrollRef} style={mainStyle} className="min-h-0 flex-1 overflow-x-clip overflow-y-auto max-md:pt-12">
            <AnimatePresence mode="popLayout" initial={false} custom={transitionCustom}>
              <motion.div
                key={pageKey}
                custom={transitionCustom}
                variants={PAGE_VARIANTS}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: (reduced ? PAGE_REDUCED_MS : PAGE_ENTER_MS) / 1000, ease: EASE_OUT }}
                className="flex h-full flex-col"
              >
                <PageFrame location={location} navigationType={navigationType} outlet={outlet} epoch={pageEpochRef.current} />
              </motion.div>
            </AnimatePresence>
          </main>

          {floating ? <FloatingNav edge={edge} onEdgeChange={setDockEdge} /> : null}

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
      <AnimatedToastStack
        toasts={toasts}
        onDismiss={dismissToast}
        position={floating && edge === "right" ? "bottom-left" : "bottom-right"}
        fixed
        className={cn("z-[10000]", floating && edge === "bottom" && "bottom-28")}
      />
      <UpdateBanner />
      <AppCommandPalette />
      <NewNoteDialog />
    </div>
  );
}
