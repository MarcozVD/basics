import { useQueryClient } from "@tanstack/react-query";
import { Command, GripHorizontal, GripVertical } from "lucide-react";
import { animate, motion, useDragControls, useMotionValue, useReducedMotion } from "motion/react";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Link, useLocation } from "react-router";
import { isNavActive, NAV_LINKS, SETTINGS_LINK } from "@/components/app/sidebar";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Dock, DockItem, DockSeparator } from "@/components/motion/dock";
import { Tooltip } from "@/components/motion/tooltip";
import { type TranslationKey, useI18n } from "@/i18n";
import { isAgentRunActive, useAgentRunStatus } from "@/lib/agent-run";
import { modChord } from "@/lib/desktop";
import { PALETTE_SEARCH_EVENT } from "@/lib/desktop-shell";
import { SPRING_LAYOUT, SPRING_PANEL } from "@/lib/ease";
import { DOCK_VERTICAL_MIN, type DockEdge } from "@/lib/navigation";
import { prefetchRoute } from "@/lib/prefetch";
import { useInbox } from "@/lib/queries";
import { cn } from "@/lib/utils";

/**
 * Caption under a bar icon. Same rules the old Dock used: 10px from `sm`, 9px from
 * 480px, and hidden below that; the icon plus its tooltip carries the name there.
 * Labels stay whole because an ellipsis on the only word that names the page reads worse.
 */
const labelClass =
  "hidden shrink-0 text-center whitespace-nowrap text-[11px] leading-none font-medium tracking-tight min-[480px]:inline sm:text-[11px]";

function shortcutLabel(item: (typeof NAV_LINKS)[number]): string | undefined {
  if (!item.shortcut) return undefined;
  return item.chord ? modChord(item.shortcut) : item.shortcut;
}

function tooltipSide(edge: DockEdge) {
  if (edge === "bottom") return "top" as const;
  if (edge === "top") return "bottom" as const;
  return edge === "left" ? ("right" as const) : ("left" as const);
}

/** One route, with the same name, shortcut, purpose, count and running dot as the sidebar. */
function FloatingItem({
  item,
  edge,
  pending,
  agentRunning,
  active,
}: {
  item: (typeof NAV_LINKS)[number];
  edge: DockEdge;
  pending: number;
  agentRunning: boolean;
  active: boolean;
}) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const Icon = item.icon;
  const shortcut = shortcutLabel(item);
  const showCount = item.to === "/inbox" && pending > 0;
  const showAgent = item.to === "/recommend" && agentRunning && !active;

  return (
    <DockItem active={active}>
      <Tooltip
        side={tooltipSide(edge)}
        sideOffset={10}
        content={
          <span className="flex flex-col gap-1">
            <span className="flex items-center gap-2">
              <span>{t(item.labelKey)}</span>
              {shortcut ? (
                <kbd className="rounded-full border border-border px-1.5 font-mono text-[11px] text-muted-foreground">
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
        <Link
          to={item.to}
          aria-label={t(item.labelKey)}
          aria-current={active ? "page" : undefined}
          onPointerEnter={() => prefetchRoute(item.to, queryClient)}
          onPointerDown={() => prefetchRoute(item.to, queryClient)}
          onFocus={() => prefetchRoute(item.to, queryClient)}
          className={cn(
            "relative flex size-full flex-col items-center justify-center gap-0.5 rounded-full px-0.5 text-muted-foreground transition-colors",
            "hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
            active && "text-foreground",
          )}
        >
          <Icon className="size-[18px] shrink-0 sm:size-5" aria-hidden="true" />
          <span aria-hidden="true" className={cn(labelClass, active ? "text-foreground" : "text-muted-foreground")}>
            {t(item.labelKey)}
          </span>
          {showCount ? (
            <span className="absolute top-0 right-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[11px] leading-none font-semibold text-primary-foreground">
              <AnimatedNumber value={pending} startOnView={false} duration={0.5} />
            </span>
          ) : null}
          {showAgent ? (
            <span aria-hidden="true" className="absolute top-0 right-1 size-2 rounded-full bg-primary motion-safe:animate-pulse" />
          ) : null}
        </Link>
      </Tooltip>
      {item.to === "/recommend" && agentRunning ? <span className="sr-only">{t("recommend.agent.runningBadge")}</span> : null}
    </DockItem>
  );
}

interface FloatingNavProps {
  /** The edge actually in use after the height fallback. */
  edge: DockEdge;
  /** The edge the reader chose; left/right may fall back to the bottom on short panels. */
  onEdgeChange: (edge: DockEdge) => void;
}

/**
 * The floating navigation bar. It snaps to one of the four panel edges, never rests in
 * between, and is dragged only by its grip so a link press always navigates. The bar is
 * positioned inside the content panel, which keeps the desktop strip and window controls
 * clear when it sits on the top edge.
 */
export function FloatingNav({ edge, onEdgeChange }: FloatingNavProps) {
  const { t } = useI18n();
  const location = useLocation();
  const reduce = useReducedMotion() ?? false;
  const inbox = useInbox();
  const agentStatus = useAgentRunStatus();
  const queryClient = useQueryClient();
  const SettingsIcon = SETTINGS_LINK.icon;
  const pending = inbox.data?.length ?? 0;
  const agentRunning = isAgentRunActive(agentStatus);
  const vertical = edge === "left" || edge === "right";

  const containerRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const controls = useDragControls();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const placed = useRef(false);
  const [snap, setSnap] = useState(0);
  const [box, setBox] = useState({ barWidth: 0, barHeight: 0, width: 0, height: 0 });

  useLayoutEffect(() => {
    const container = containerRef.current;
    const bar = barRef.current;
    if (!container || !bar) return;
    const measure = () => {
      const next = {
        barWidth: bar.offsetWidth,
        barHeight: bar.offsetHeight,
        width: container.clientWidth,
        height: container.clientHeight,
      };
      setBox((prev) =>
        prev.barWidth === next.barWidth && prev.barHeight === next.barHeight && prev.width === next.width && prev.height === next.height
          ? prev
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  const targetX =
    edge === "bottom" || edge === "top" ? Math.max(0, (box.width - box.barWidth) / 2) : edge === "left" ? 0 : box.width - box.barWidth;
  const targetY =
    edge === "left" || edge === "right" ? Math.max(0, (box.height - box.barHeight) / 2) : edge === "top" ? 0 : box.height - box.barHeight;

  // biome-ignore lint/correctness/useExhaustiveDependencies: snap moves the bar back to the same edge after a drag.
  useEffect(() => {
    if (!box.barWidth || !box.barHeight) return;
    if (!placed.current) {
      x.set(targetX);
      y.set(targetY);
      placed.current = true;
      return;
    }
    const transition = reduce ? { duration: 0 } : SPRING_LAYOUT;
    const animationX = animate(x, targetX, transition);
    const animationY = animate(y, targetY, transition);
    return () => {
      animationX.stop();
      animationY.stop();
    };
  }, [targetX, targetY, reduce, box.barWidth, box.barHeight, snap]);

  const onDragEnd = (_event: unknown, info: { point: { x: number; y: number } }) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const distances: { edge: DockEdge; distance: number }[] = [
      { edge: "left", distance: Math.abs(info.point.x - rect.left) },
      { edge: "top", distance: Math.abs(info.point.y - rect.top) },
      { edge: "right", distance: Math.abs(rect.right - info.point.x) },
      { edge: "bottom", distance: Math.abs(rect.bottom - info.point.y) },
    ];
    distances.sort((a, b) => a.distance - b.distance);
    let next = distances[0]?.edge ?? "bottom";
    // A bar that cannot fit along the height falls back to the bottom.
    if ((next === "left" || next === "right") && rect.height < DOCK_VERTICAL_MIN) next = "bottom";
    onEdgeChange(next);
    setSnap((value) => value + 1);
  };

  const onGripKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const next =
      event.key === "ArrowLeft"
        ? "left"
        : event.key === "ArrowRight"
          ? "right"
          : event.key === "ArrowUp"
            ? "top"
            : event.key === "ArrowDown"
              ? "bottom"
              : null;
    if (!next) return;
    event.preventDefault();
    onEdgeChange(next);
    setSnap((value) => value + 1);
  };

  const startDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    controls.start(event);
  };

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-2 z-40">
      <motion.nav
        ref={barRef}
        aria-label={t("nav.primary")}
        data-testid="floating-nav"
        data-edge={edge}
        drag
        dragListener={false}
        dragControls={controls}
        dragMomentum={false}
        dragElastic={0.06}
        dragConstraints={{ left: 0, top: 0, right: Math.max(0, box.width - box.barWidth), bottom: Math.max(0, box.height - box.barHeight) }}
        onDragEnd={onDragEnd}
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: box.barWidth ? 1 : 0, scale: box.barWidth ? 1 : 0.96 }}
        transition={reduce ? { duration: 0 } : SPRING_PANEL}
        style={{ x, y }}
        className="pointer-events-auto absolute top-0 left-0 touch-none"
      >
        <Dock className={cn("shadow-[0_8px_30px_rgba(0,0,0,0.25)]", vertical && "flex-col items-center")}>
          <button
            type="button"
            data-testid="nav-grip"
            aria-label={t("nav.move")}
            onPointerDown={startDrag}
            onKeyDown={onGripKeyDown}
            className={cn(
              "grid shrink-0 cursor-grab place-items-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground active:cursor-grabbing",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              vertical ? "h-5 w-9" : "h-9 w-5",
            )}
          >
            {vertical ? <GripHorizontal className="size-4" aria-hidden="true" /> : <GripVertical className="size-4" aria-hidden="true" />}
          </button>

          {NAV_LINKS.map((item) => (
            <FloatingItem
              key={item.to}
              item={item}
              edge={edge}
              pending={pending}
              agentRunning={agentRunning}
              active={isNavActive(location.pathname, item.to)}
            />
          ))}

          <DockSeparator className={vertical ? "mx-0 my-0.5 h-px w-6 self-center" : undefined} />

          <DockItem>
            <Tooltip
              side={tooltipSide(edge)}
              sideOffset={10}
              content={
                <span className="flex flex-col gap-1">
                  <span className="flex items-center gap-2">
                    <span>{t("nav.palette")}</span>
                    <kbd className="rounded-full border border-border px-1.5 font-mono text-[11px] text-muted-foreground">
                      {t("shortcuts.palette", { combo: modChord("K") })}
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
                <span aria-hidden="true" className={labelClass}>
                  {t("nav.paletteShort")}
                </span>
              </button>
            </Tooltip>
          </DockItem>

          <DockSeparator className={vertical ? "mx-0 my-0.5 h-px w-6 self-center" : undefined} />

          <DockItem active={isNavActive(location.pathname, SETTINGS_LINK.to)}>
            <Tooltip
              side={tooltipSide(edge)}
              sideOffset={10}
              content={
                <span className="flex items-center gap-2">
                  <span>{t("nav.settings")}</span>
                  <kbd className="rounded-full border border-border px-1.5 font-mono text-[11px] text-muted-foreground">
                    {modChord(SETTINGS_LINK.shortcut ?? ",")}
                  </kbd>
                </span>
              }
            >
              <Link
                to={SETTINGS_LINK.to}
                aria-label={t("nav.settings")}
                aria-current={isNavActive(location.pathname, SETTINGS_LINK.to) ? "page" : undefined}
                onPointerEnter={() => prefetchRoute(SETTINGS_LINK.to, queryClient)}
                className="relative flex size-full flex-col items-center justify-center gap-0.5 rounded-full px-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-[current=page]:text-foreground"
              >
                <SettingsIcon className="size-[18px] shrink-0 sm:size-5" aria-hidden="true" />
                <span aria-hidden="true" className={labelClass}>
                  {t("nav.settings")}
                </span>
              </Link>
            </Tooltip>
          </DockItem>
        </Dock>
      </motion.nav>

      <span aria-live="polite" className="sr-only">
        {t("nav.edge.announce", { edge: t(`nav.edge.${edge}` as TranslationKey) })}
      </span>
    </div>
  );
}
