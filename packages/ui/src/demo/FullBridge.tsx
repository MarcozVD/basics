import { useIsFetching } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useLocation } from "react-router";
import { useTheme } from "@/lib/theme";

/** The hero uses the full app shell but the same rendered-content handshake as app parts. */
export function FullBridge() {
  const fetching = useIsFetching();
  const { pathname } = useLocation();
  const { setTheme } = useTheme();
  const sent = useRef(false);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== window.parent) return;
      if (event.data?.type === "theme" && (event.data.value === "dark" || event.data.value === "light")) setTheme(event.data.value);
    };
    addEventListener("message", receive);
    return () => removeEventListener("message", receive);
  }, [setTheme]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: route changes retry the initial readiness probe after lazy navigation.
  useEffect(() => {
    if (sent.current || fetching) return;
    let first = 0;
    let second = 0;
    const selector = '#main-content h1, #main-content [data-testid="graph-canvas"], #main-content [role="alert"]';
    const probe = () => {
      if (sent.current || !document.querySelector(selector)) return;
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
          if (sent.current || !document.querySelector(selector)) return;
          sent.current = true;
          observer.disconnect();
          window.parent.postMessage({ source: "basics-demo", type: "ready", part: "full" }, location.origin);
        });
      });
    };
    // Cached shell queries may finish before the lazy route chunk mounts. Observe that commit too.
    const observer = new MutationObserver(probe);
    observer.observe(document.getElementById("main-content") || document.body, { childList: true, subtree: true });
    probe();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [fetching, pathname]);
  return null;
}
