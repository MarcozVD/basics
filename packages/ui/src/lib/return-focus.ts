import { type RefObject, useLayoutEffect, useRef } from "react";

/**
 * Overlays opened from a keyboard shortcut, an event or an async action have no trigger to return to.
 * Remember what had focus when `open` turned true and restore it on close; `fallback` covers the case
 * where that element is gone or was disabled in the meantime (for example a button that went busy).
 */
export function useReturnFocus(open: boolean, fallback?: RefObject<HTMLElement | null>) {
  const previous = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(open);

  useLayoutEffect(() => {
    if (open === wasOpen.current) return;
    wasOpen.current = open;
    if (open) {
      const active = document.activeElement;
      previous.current = active instanceof HTMLElement && active !== document.body ? active : null;
      return;
    }
    const target = previous.current;
    previous.current = null;
    // Run after the overlay's own cleanup so its focus handling does not win.
    const frame = requestAnimationFrame(() => {
      // Leave focus alone if something outside the closing overlay already took it.
      const active = document.activeElement;
      if (active && active !== document.body && !active.closest('[role="dialog"]')) return;
      const usable = (element: HTMLElement | null | undefined): element is HTMLElement =>
        Boolean(element?.isConnected) && !element?.matches(":disabled");
      if (usable(target)) target.focus();
      else if (usable(fallback?.current)) fallback.current.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, fallback]);
}
