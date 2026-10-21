import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nProvider } from "@/i18n";
import { ThemeProvider } from "@/lib/theme";
import App from "./App";
import "./index.css";

// After a rebuild, an open tab still asks for the old chunk names. Reload once onto the
// new build instead of showing a router error; the flag stops a reload loop.
window.addEventListener("vite:preloadError", (event) => {
  try {
    if (sessionStorage.getItem("basics:chunk-reload")) return;
    sessionStorage.setItem("basics:chunk-reload", "1");
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});
window.addEventListener("load", () => {
  try {
    setTimeout(() => sessionStorage.removeItem("basics:chunk-reload"), 10_000);
  } catch {}
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 10_000 },
  },
});

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
