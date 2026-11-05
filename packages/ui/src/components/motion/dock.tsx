"use client";
// beui.dev/components/motion/dock

import { motion, useReducedMotion } from "motion/react";
import { createContext, useContext, useId, useMemo, type ReactNode } from "react";
import { SPRING_LAYOUT } from "@/lib/ease";
import { cn } from "@/lib/utils";

type DockContextValue = {
  size: number;
  pillLayoutId: string;
};

const DockContext = createContext<DockContextValue | null>(null);

export interface DockProps {
  children: ReactNode;
  className?: string;
  /** Size of each item in px. */
  size?: number;
}

export function Dock({ children, size = 44, className }: DockProps) {
  const pillLayoutId = useId();
  const ctx = useMemo<DockContextValue>(
    () => ({ size, pillLayoutId }),
    [size, pillLayoutId],
  );

  return (
    <DockContext.Provider value={ctx}>
      <div
        className={cn(
          // Basics: seven routes plus the palette share the Dock, each with a short label
          // under its icon. Captions are 9px from 480px and 10px from `sm` up, with the
          // item widened to match; below 480px the space does not fit a readable caption,
          // so items fall back to icons (40×44, easing down to fit a 320px screen) and the
          // tooltip carries the name. `size` stays the fallback.
          "inline-flex h-auto items-end gap-0.5 rounded-2xl border border-border bg-card/80 px-1 py-1 shadow-2xl backdrop-blur-xl sm:gap-1 sm:px-2",
          "[--dock-item-width:min(40px,calc((100vw-2rem)/8))] [--dock-item-height:44px] min-[480px]:[--dock-item-width:min(55px,calc((100vw-2rem)/8))] sm:[--dock-item-width:64px] sm:[--dock-item-height:48px]",
          className,
        )}
      >
        {children}
      </div>
    </DockContext.Provider>
  );
}

export interface DockItemProps {
  children: ReactNode;
  className?: string;
  /** When set, the item renders as a <button>. Omit when children carry their own link or button. */
  onClick?: () => void;
  active?: boolean;
  "aria-label"?: string;
}

export function DockItem({
  children,
  className,
  onClick,
  active,
  ...rest
}: DockItemProps) {
  const dock = useContext(DockContext);
  const reduce = useReducedMotion();
  const size = dock?.size ?? 44;
  const pillLayoutId = dock?.pillLayoutId ?? "dock-pill";

  const pill = active ? (
    <motion.span
      layoutId={pillLayoutId}
      transition={reduce ? { duration: 0 } : SPRING_LAYOUT}
      className="absolute inset-0.5 -z-10 rounded-xl bg-muted/60"
    />
  ) : null;
  const sharedStyle = { width: `var(--dock-item-width, ${size}px)`, height: `var(--dock-item-height, ${size}px)` };
  const sharedClass = cn(
    "relative flex shrink-0 items-center justify-center rounded-full text-foreground",
    className,
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={rest["aria-label"]}
        aria-pressed={active}
        style={sharedStyle}
        className={cn(
          sharedClass,
          "cursor-pointer border-0 bg-transparent p-0 outline-none",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        {pill}
        {children}
      </button>
    );
  }

  // Children carry their own link or button (and its accessible name).
  return (
    <div style={sharedStyle} className={sharedClass}>
      {pill}
      {children}
    </div>
  );
}

export function DockSeparator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("mx-0.5 h-6 w-px self-center bg-border sm:mx-1", className)}
    />
  );
}
