import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const uiSrc = fileURLToPath(new URL("./packages/ui/src", import.meta.url));

export default defineConfig({
  resolve: {
    // UI modules import each other through the `@/` alias (same as vite.config.ts).
    alias: { "@": uiSrc },
  },
  test: {
    // Several core tests (recommend eval, pack installs) run over the 5s default
    // on slower machines purely from cold I/O; keep a generous bound.
    testTimeout: 20_000,
    // Spawn-heavy compare suites run after watcher tests, one file at a time.
    // This keeps their agent subprocesses from starving macOS filesystem events.
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["packages/*/test/**/*.test.ts"], exclude: ["packages/basics/test/compare*.test.ts"] },
      },
      {
        extends: true,
        test: { name: "compare", include: ["packages/basics/test/compare*.test.ts"], fileParallelism: false, sequence: { groupOrder: 1 } },
      },
    ],
  },
});
