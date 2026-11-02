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
          // Basics: seven routes plus the palette now share the Dock, so items step down to
          // 36px on a phone and return to 44px from `sm` up. `size` stays the fallback.
          "inline-flex h-auto items-end gap-1 rounded-2xl border border-border bg-card/80 px-2 py-1 shadow-2xl backdrop-blur-xl sm:gap-1.5",
          "[--dock-item-size:36px] sm:[--dock-item-size:44px]",
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
  const sharedStyle = { width: `var(--dock-item-size, ${size}px)`, height: `var(--dock-item-size, ${size}px)` };
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
      className={cn("mx-1 h-6 w-px self-center bg-border", className)}
    />
  );
}
