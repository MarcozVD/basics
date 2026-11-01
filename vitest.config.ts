import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    // Several core tests (recommend eval, pack installs) run over the 5s default
    // on slower machines purely from cold I/O; keep a generous bound.
    testTimeout: 20_000,
  },
});
