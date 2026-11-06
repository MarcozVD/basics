import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const PORT = 4812;
const STATE_FILE = ".vault-path-onboarding";
const HERE = import.meta.dirname;

test.use({ baseURL: `http://127.0.0.1:${PORT}` });

let server: ChildProcess | undefined;

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) return;
    } catch {
      // Server not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("onboarding e2e server did not start");
}

test.beforeAll(async () => {
  server = spawn(process.execPath, ["e2e/serve.mjs"], {
    cwd: path.resolve(HERE, ".."),
    env: { ...process.env, BASICS_E2E_EMPTY: "1", BASICS_E2E_PORT: String(PORT), BASICS_E2E_STATE: STATE_FILE },
    stdio: "ignore",
  });
  await waitForHealth();
});

test.afterAll(async () => {
  const child = server;
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
  });
  fs.rmSync(path.join(HERE, STATE_FILE), { force: true });
});

test("an empty vault explains every page and offers one way out", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.getByText("Your vault is empty", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Install starter notes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "New note" }).first()).toBeVisible();

  await page.goto("/inbox");
  await expect(page.getByText("Nothing to review yet", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Install starter notes" })).toBeVisible();

  await page.goto("/projects");
  await expect(page.getByRole("heading", { name: "No projects yet", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New project", exact: true })).toBeVisible();

  await page.goto("/recommend");
  await expect(
    page.getByText("Recommend reads your notes to suggest a stack. Install the starter packs first, then describe a project.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Install starter notes" })).toBeVisible();

  await page.goto("/graph");
  await expect(page.getByText("Your vault is empty", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Install starter notes" })).toBeVisible();
});

test("an empty vault installs the starter packs and Home shows counts", async ({ page, request }) => {
  const packs = (await (await request.get("/api/packs")).json()) as { name: string; notes: number; version: string }[];
  expect(packs.length).toBeGreaterThan(0);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Start with a starter pack" })).toBeVisible();
  // The pack picker's language toggle is labelled; Settings > General owns the language choice.
  await expect(page.getByText("Notes language", { exact: true })).toBeVisible();
  // The first-run checklist explains the loop before the packs; step 1 is open.
  const steps = page.getByTestId("home-getting-started");
  await expect(steps).toContainText("Get set up");
  await expect(steps).toHaveAttribute("aria-label", "0 of 3 steps done");
  for (const pack of packs) {
    await expect(page.getByRole("checkbox", { name: pack.name, exact: true })).toBeChecked();
  }

  await page.getByRole("button", { name: `Install ${packs.length} packs` }).click();
  await expect(page.getByRole("heading", { name: "Start with a starter pack" })).toBeHidden();
  // Notes are installed, so the first step ticks from real state.
  await expect(page.getByTestId("home-getting-started")).toHaveAttribute("aria-label", "1 of 3 steps done");

  const stats = (await (await request.get("/api/stats")).json()) as { total: number; counts: Record<string, number> };
  expect(stats.total).toBeGreaterThan(0);
  expect(stats.counts.tech).toBeGreaterThan(0);
  await expect(page.locator('[data-stat="tech"]')).toContainText(String(stats.counts.tech));
  await expect(page.locator('[data-stat="practice"]')).toContainText(String(stats.counts.practice));

  await page.goto("/?packs=1");
  await expect(page.getByRole("heading", { name: "All starter packs are installed" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Install \d+ packs/ })).toHaveCount(0);
  for (const pack of packs) {
    await expect(page.getByRole("checkbox", { name: pack.name, exact: true })).toHaveCount(0);
    await expect(page.getByText(`installed v${pack.version}`).first()).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "Back to Home" })).toBeVisible();
});
