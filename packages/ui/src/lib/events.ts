import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

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
    source.addEventListener("vault", onVault);
    source.addEventListener("activity", onActivity);
    return () => {
      source.removeEventListener("vault", onVault);
      source.removeEventListener("activity", onActivity);
      source.close();
    };
  }, [queryClient]);
}
