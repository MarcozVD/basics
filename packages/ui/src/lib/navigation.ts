import { useEffect, useState, useSyncExternalStore } from "react";
import { isDesktop } from "@/lib/desktop";

/** Where navigation lives: the shell sidebar or a floating bar over the panel. */
export type NavigationStyle = "sidebar" | "floating";
/** The edge the floating bar snaps to. It never rests anywhere else. */
export type DockEdge = "bottom" | "top" | "left" | "right";

interface NavigationState {
  style: NavigationStyle;
  edge: DockEdge;
}

/** An explicit style choice. Absent means Sidebar, the default on every install. */
const STYLE_KEY = "basics:navigation";
/** The remembered bar edge; Bottom is the default. */
const EDGE_KEY = "basics:dock-edge";

const DEFAULT_STATE: NavigationState = { style: "sidebar", edge: "bottom" };

function readState(): NavigationState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  let style: NavigationStyle = "sidebar";
  let edge: DockEdge = "bottom";
  try {
    if (localStorage.getItem(STYLE_KEY) === "floating") style = "floating";
    const storedEdge = localStorage.getItem(EDGE_KEY);
    if (storedEdge === "top" || storedEdge === "left" || storedEdge === "right" || storedEdge === "bottom") edge = storedEdge;
  } catch {
    // Storage can be unavailable in private or restricted contexts.
  }
  return { style, edge };
}

let current = readState();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setNavigationStyle(style: NavigationStyle): void {
  if (current.style === style) return;
  current = { ...current, style };
  try {
    localStorage.setItem(STYLE_KEY, style);
  } catch {
    // The in-memory choice still applies for this visit.
  }
  emit();
}

export function setDockEdge(edge: DockEdge): void {
  if (current.edge === edge) return;
  current = { ...current, edge };
  try {
    localStorage.setItem(EDGE_KEY, edge);
  } catch {
    // The in-memory choice still applies for this visit.
  }
  emit();
}

/** The style and edge, shared by the shell, Settings and the floating bar. */
export function useNavigation(): NavigationState {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => DEFAULT_STATE,
  );
}

// Another tab changing the choice follows here without a reload.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STYLE_KEY && event.key !== EDGE_KEY) return;
    const next = readState();
    if (next.style === current.style && next.edge === current.edge) return;
    current = next;
    emit();
  });
}

/** The floating bar's own height (items 48 + padding 8 + border 2). */
export const DOCK_HEIGHT = 58;
/** The floating bar's width when it stands on the left or right edge. */
export const DOCK_WIDTH = 74;
/** Inner gap between the bar and the panel edge. */
export const DOCK_OFFSET = 8;
/** Space a page keeps clear below/above a horizontal bar. */
export const DOCK_SPACE = DOCK_HEIGHT + 24;
/** Space a page keeps clear beside a vertical bar. */
export const DOCK_SPACE_VERTICAL = DOCK_WIDTH + 24;
/** Under this panel height a vertical bar would not fit, so it falls back to the bottom. */
export const DOCK_VERTICAL_MIN = 530;

/** A left/right bar falls back to the bottom when the panel is too short to hold it. */
export function resolveDockEdge(edge: DockEdge, availableHeight: number): DockEdge {
  return (edge === "left" || edge === "right") && availableHeight < DOCK_VERTICAL_MIN ? "bottom" : edge;
}

/**
 * The edge the floating bar is actually using, or `null` in Sidebar style. Pages and fixed
 * overlays use it to keep their own bottom/top bars clear of the navigation bar.
 */
export function useResolvedDockEdge(): DockEdge | null {
  const navigation = useNavigation();
  const [height, setHeight] = useState(() => (typeof window === "undefined" ? 0 : window.innerHeight));
  useEffect(() => {
    const onResize = () => setHeight(window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  if (navigation.style !== "floating") return null;
  return resolveDockEdge(navigation.edge, height - (isDesktop() ? 56 : 16));
}
