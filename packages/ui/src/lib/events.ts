import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function useVaultEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/events");
    const onVault = () => {
      void queryClient.invalidateQueries();
    };
    const onActivity = () => {
      void queryClient.invalidateQueries({ queryKey: ["activity"] });
    };
    const onEmbeddings = () => {
      void queryClient.invalidateQueries({ queryKey: ["embeddings"] });
    };
    source.addEventListener("vault", onVault);
    source.addEventListener("activity", onActivity);
    source.addEventListener("embeddings", onEmbeddings);
    return () => {
      source.removeEventListener("vault", onVault);
      source.removeEventListener("activity", onActivity);
      source.removeEventListener("embeddings", onEmbeddings);
      source.close();
    };
  }, [queryClient]);
}

/** Live embedding progress from the SSE hub, used while enabling semantic matching. */
export function useEmbeddingsProgress(active: boolean): { done: number; total: number } | null {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!active || typeof EventSource === "undefined") {
      setProgress(null);
      return;
    }
    const source = new EventSource("/api/events");
    const onEmbeddings = (event: Event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as { done?: unknown; total?: unknown };
        if (typeof data.done === "number" && typeof data.total === "number") setProgress({ done: data.done, total: data.total });
      } catch {
        // Ignore malformed frames.
      }
    };
    source.addEventListener("embeddings", onEmbeddings);
    return () => {
      source.removeEventListener("embeddings", onEmbeddings);
      source.close();
      setProgress(null);
    };
  }, [active]);

  return progress;
}
