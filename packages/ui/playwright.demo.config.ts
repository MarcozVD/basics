import { defineConfig, devices } from "@playwright/test";

const port = process.env.BASICS_DEMO_TEST_PORT ?? "4860";

export default defineConfig({
  testDir: "demo-e2e",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: `http://127.0.0.1:${port}/basics/demo/`,
    reducedMotion: "reduce",
    ...(process.env.BASICS_DEMO_BROWSER_CHANNEL ? { channel: process.env.BASICS_DEMO_BROWSER_CHANNEL } : {}),
  },
  webServer: {
    command: "node demo-e2e/serve.mjs",
    url: `http://127.0.0.1:${port}/basics/demo/`,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
