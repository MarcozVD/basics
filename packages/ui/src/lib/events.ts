import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

export function useVaultEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/events");
    const onVault = () => {
      void queryClient.invalidateQueries();
    };
    source.addEventListener("vault", onVault);
    return () => {
      source.removeEventListener("vault", onVault);
      source.close();
    };
  }, [queryClient]);
}
