import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@/i18n";
import { ThemeProvider } from "@/lib/theme";
import snapshotJSON from "../../../../scripts/demo/generated/snapshot.json?raw";
import { installDemoFetch, type Snapshot } from "./api";
import "../index.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 10_000 } } });
await installDemoFetch(JSON.parse(snapshotJSON) as Snapshot, () => {
  void queryClient.invalidateQueries();
});
// Import only after the shim is installed, including modules that restore session state on import.
// Recommendation results are demo state too; a reload always starts from the recorded vault.
try {
  sessionStorage.removeItem("basics:recommend");
} catch {}
const { default: App } = window.location.pathname.startsWith("/basics/demo/embed/") ? await import("./EmbedApp") : await import("./App");
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
);
