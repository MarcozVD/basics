import { useCallback } from "react";
import { type NavigateFunction, type NavigateOptions, type To, useNavigate } from "react-router";
import { beginNavigation } from "@/lib/page-transition";

/** The pathname `to` points at, or `null` when it cannot change the pathname. */
function targetPathname(to: To): string | null {
  if (typeof to === "string") {
    try {
      return new URL(to, window.location.href).pathname;
    } catch {
      return null;
    }
  }
  if (!to.pathname) return null;
  try {
    return new URL(to.pathname, window.location.href).pathname;
  } catch {
    return null;
  }
}

/**
 * `useNavigate` that signals navigation intent before React commits the route. Every
 * programmatic navigation (shortcuts, the command palette, toast actions, dialogs) uses this
 * instead of the router's hook, so a heavy page about to be left can abandon its boot at the
 * same moment a link click already does.
 *
 * Numeric moves (`navigate(-1)`, `navigate(1)`) are history moves: the destination is not
 * known until the browser fires `popstate`, so the shell's capture listener signals those.
 * A navigation that keeps the pathname (a query or hash change) is not a page change and must
 * not count, or a filter update would blank the graph canvas.
 */
export function useIntentNavigate(): NavigateFunction {
  const navigate = useNavigate();
  return useCallback<NavigateFunction>(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to !== "number") {
        const target = targetPathname(to);
        if (target !== null && target !== window.location.pathname) beginNavigation();
      }
      return (navigate as (to: To | number, options?: NavigateOptions) => void | Promise<void>)(to, options);
    },
    [navigate],
  );
}
