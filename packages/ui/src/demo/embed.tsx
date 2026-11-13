import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Loading } from "@/components/state";
import { useTheme } from "@/lib/theme";

export type Part = "explore" | "note" | "graph" | "proposal" | "recommend";
const ReadyContext = createContext<(() => void) | null>(null);

/** Post only after the data-backed component committed and had a paint opportunity. */
export function useEmbedReady(ready: boolean) {
  const publish = useContext(ReadyContext);
  useEffect(() => {
    if (!ready || !publish) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(publish);
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [ready, publish]);
}

export function EmbedFrame({ part, children }: { part: Part; children: ReactNode }) {
  const { setTheme } = useTheme();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const published = useRef(false);
  useEffect(() => {
    if (part !== "note" && part !== "graph") return;
    const id = params.get(part === "note" ? "id" : "focus") || "nextjs";
    window.parent.postMessage({ source: "basics-demo", type: "focus", part, id }, window.location.origin);
  }, [params, part]);
  const publish = useCallback(() => {
    if (published.current) return;
    published.current = true;
    window.parent.postMessage({ source: "basics-demo", type: "ready", part }, window.location.origin);
  }, [part]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || !event.data || typeof event.data !== "object")
        return;
      const { type, value, id } = event.data;
      if (type === "theme" && (value === "dark" || value === "light")) setTheme(value);
      if (typeof id !== "string" || !id || id.length > 128) return;
      const key =
        type === "scenario" && part === "recommend"
          ? "scenario"
          : type === "focus" && (part === "note" || part === "graph")
            ? part === "note"
              ? "id"
              : "focus"
            : null;
      if (key) {
        const next = new URLSearchParams(params);
        next.set(key, id);
        void navigate({ search: `?${next}` }, { replace: true });
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [navigate, params, part, setTheme]);
  return (
    <ReadyContext.Provider value={publish}>
      <main className="demo-embed" data-embed-part={part}>
        {children}
      </main>
    </ReadyContext.Provider>
  );
}

export function EmbedLoading() {
  return (
    <div className="p-6">
      <Loading />
    </div>
  );
}
