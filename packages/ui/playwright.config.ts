import { defineConfig, devices } from "@playwright/test";

const port = process.env.BASICS_E2E_PORT ?? "4810";

export default defineConfig({
  testDir: "e2e",
  // The specs share one temp vault, so run them serially to keep disk state predictable.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  globalSetup: "./e2e/global-setup.ts",
  webServer: {
    // Playwright starts webServer plugin tasks before globalSetup, so the launcher
    // creates the temp vault itself and records the path for globalSetup and specs.
    command: "node e2e/serve.mjs",
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
