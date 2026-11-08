import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const uiSrc = fileURLToPath(new URL("./packages/ui/src", import.meta.url));

export default defineConfig({
  resolve: {
    // UI modules import each other through the `@/` alias (same as vite.config.ts).
    alias: { "@": uiSrc },
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    // Several core tests (recommend eval, pack installs) run over the 5s default
    // on slower machines purely from cold I/O; keep a generous bound.
    testTimeout: 20_000,
  },
});
