import { useEffect, useState } from "react";

export interface ProgressiveOptions {
  /** Under this many rows, render the whole list in one pass. */
  eager?: number;
  /** Rows mounted on the first paint: enough to cover the viewport. */
  initial?: number;
  /** Rows added per idle slice after that. */
  chunk?: number;
  /** When false, mount nothing yet; the page frame gets the first paint. */
  active?: boolean;
}

const EAGER = 30;
const INITIAL = 10;
const CHUNK = 16;

/**
 * How many rows of a long list to mount right now.
 *
 * A big list is not rendered in one commit: the first screenful mounts immediately and the
 * rest arrive in idle chunks, so a click paints the page frame first and the main thread is
 * never blocked for the whole list. Short lists (`eager`) skip all of this and keep their
 * exact previous behaviour. A fresh data set (filter, search, sort, view) restarts at the
 * first screenful.
 */
export function useProgressiveCount(total: number, resetKey: string, options: ProgressiveOptions = {}): number {
  const eager = options.eager ?? EAGER;
  const initial = options.initial ?? INITIAL;
  const chunk = options.chunk ?? CHUNK;
  const active = options.active ?? true;
  const firstSlice = total <= eager ? total : Math.min(total, initial);
  const [count, setCount] = useState(firstSlice);

  // biome-ignore lint/correctness/useExhaustiveDependencies: resetKey stands in for the filter set
  useEffect(() => {
    setCount(total <= eager ? total : Math.min(total, initial));
  }, [resetKey, total, eager, initial]);

  useEffect(() => {
    if (!active || count >= total) return;
    let cancelled = false;
    const step = () => {
      if (!cancelled) setCount((value) => Math.min(total, value + chunk));
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(step, { timeout: 120 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(handle);
      };
    }
    const timer = window.setTimeout(step, 16);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [active, count, total, chunk]);

  // The first active render mounts the first slice even before the reset effect runs, so a
  // list never flashes its group headings with no rows.
  const firstSliceNow = total <= eager ? total : Math.min(total, initial);
  return active ? Math.max(count, firstSliceNow) : 0;
}

/**
 * False on the very first render, true after one animation frame. Pages use it to paint
 * their frame (title and controls) before mounting a list, so the click's first frame is cheap.
 */
export function useFirstPaint(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return ready;
}
