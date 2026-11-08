import { useCallback, useState } from "react";
import { useLocation, useSearchParams } from "react-router";

type SetSearchParams = ReturnType<typeof useSearchParams>[1];

/**
 * `useSearchParams` whose setter is inert once the shell has left the page it was mounted for.
 *
 * An exiting page stays mounted for its fade-out and keeps reading its frozen location
 * context (see `PageFrame`), but a real `setSearchParams` writes through the live router. That
 * is how Inbox's selected `?p=` used to land on `/recommend?p=intro-proposal`. The route a page
 * was mounted for is the guard: query-only changes keep the same pathname and still write,
 * while any pathname change makes an outgoing page's writes no-ops.
 *
 * The page's own location context is deliberately frozen at the route it was mounted for, so
 * that is the guard; the live URL is read from `window.location` because the frozen context
 * would otherwise make an outgoing page look current.
 */
export function useRouteSearchParams(): [URLSearchParams, SetSearchParams] {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const [route] = useState(pathname);
  const setIfCurrent = useCallback<SetSearchParams>(
    (next, options) => {
      if (typeof window !== "undefined" && window.location.pathname !== route) return;
      setParams(next, options);
    },
    [route, setParams],
  );
  return [params, setIfCurrent];
}
