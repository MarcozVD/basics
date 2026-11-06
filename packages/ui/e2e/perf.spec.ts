import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

/**
 * Page-budget guard.
 *
 * Stage 3 makes a sidebar click paint the route frame first and mount the heavy content
 * afterwards, so a click on a cold app must never block the main thread for long. These
 * specs measure the main thread in the 340ms after a click on a vault of ~360 notes and
 * assert a generous 150ms budget: the real measured worst case is far below it, and the
 * margin keeps the assertion from flaking on a slow CI machine.
 */
const PORT = 4815;
const STATE = ".vault-path-budget";
const HERE = import.meta.dirname;
const CLICK_WINDOW_MS = 340;
const LONG_TASK_BUDGET_MS = 150;

interface BudgetSample {
  t0: number;
  long: { start: number; duration: number }[];
  frames: number[];
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`budget server on ${port} did not start`);
}

async function arm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const win = window as unknown as {
      __budget?: BudgetSample;
      __budgetObserver?: PerformanceObserver;
    };
    if (!win.__budget) {
      const created: BudgetSample = { t0: 0, long: [], frames: [] };
      win.__budget = created;
      win.__budgetObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) created.long.push({ start: entry.startTime, duration: entry.duration });
      });
      win.__budgetObserver.observe({ entryTypes: ["longtask"] });
    }
    const sample = win.__budget;
    document.addEventListener(
      "click",
      () => {
        sample.t0 = performance.now();
        sample.long.length = 0;
        sample.frames.length = 0;
        const tick = (ts: number) => {
          sample.frames.push(ts);
          if (performance.now() - sample.t0 < 450) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { capture: true, once: true },
    );
  });
}

function readBudget(sample: BudgetSample) {
  const long = sample.long
    .filter((entry) => entry.start >= sample.t0 - 2 && entry.start - sample.t0 < CLICK_WINDOW_MS)
    .map((entry) => entry.duration);
  let worstGap = 0;
  for (let i = 1; i < sample.frames.length; i++) worstGap = Math.max(worstGap, sample.frames[i] - sample.frames[i - 1]);
  return { long, worstGap };
}

function expectBudget(sample: BudgetSample) {
  const { long, worstGap } = readBudget(sample);
  for (const duration of long) expect(duration).toBeLessThan(LONG_TASK_BUDGET_MS);
  // The frame gap is the human-visible number; keep a generous ceiling too.
  expect(worstGap).toBeLessThan(LONG_TASK_BUDGET_MS);
}

test.describe("page budget", () => {
  test.use({ baseURL: `http://127.0.0.1:${PORT}` });
  test.setTimeout(120_000);
  let server: ChildProcess | undefined;

  test.beforeAll(async () => {
    server = spawn(process.execPath, ["e2e/serve.mjs"], {
      cwd: path.resolve(HERE, ".."),
      env: {
        ...process.env,
        BASICS_E2E_GENERATED: "200",
        BASICS_E2E_WORK: "60",
        BASICS_E2E_PORT: String(PORT),
        BASICS_E2E_STATE: STATE,
      },
      stdio: "ignore",
    });
    await waitForHealth(PORT);
  });

  test.afterAll(async () => {
    const child = server;
    if (!child || child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill();
    });
  });

  test("a click on Explore never blocks the main thread past the budget", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);
    await arm(page);

    await page.getByTestId("sidebar").getByRole("link", { name: "Explore", exact: true }).click();
    await page.waitForTimeout(700);

    const sample = await page.evaluate(() => (window as unknown as { __budget: BudgetSample }).__budget);
    const { long, worstGap } = readBudget(sample);
    for (const duration of long) expect(duration).toBeLessThan(LONG_TASK_BUDGET_MS);
    // The frame gap is the human-visible number; keep a generous ceiling too.
    expect(worstGap).toBeLessThan(LONG_TASK_BUDGET_MS);
  });

  test("returning to Explore stays inside the budget", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/explore");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(700);
    await page.getByTestId("sidebar").getByRole("link", { name: "Home", exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
    await page.waitForTimeout(500);
    await arm(page);

    await page.getByTestId("sidebar").getByRole("link", { name: "Explore", exact: true }).click();
    await page.waitForTimeout(700);

    const sample = await page.evaluate(() => (window as unknown as { __budget: BudgetSample }).__budget);
    expectBudget(sample);
  });

  test("leaving the graph during its first layout does not block the next page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);
    const sidebar = page.getByTestId("sidebar");

    // Enter while the canvas is still booting, then leave before its first layout settles.
    await sidebar.getByRole("link", { name: "Graph", exact: true }).click();
    await page.waitForTimeout(700);
    await arm(page);
    await sidebar.getByRole("link", { name: "Inbox", exact: true }).click();
    await page.waitForTimeout(700);

    const sample = await page.evaluate(() => (window as unknown as { __budget: BudgetSample }).__budget);
    expectBudget(sample);
  });

  test("returning to the graph and leaving it stays inside the budget", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/graph");
    await page.getByTestId("graph-canvas").waitFor({ timeout: 60_000 });
    await page.waitForTimeout(4000);
    const sidebar = page.getByTestId("sidebar");

    // A settled graph keeps its canvas: the return must re-attach it without a long task.
    await sidebar.getByRole("link", { name: "Inbox", exact: true }).click();
    await page.waitForTimeout(700);
    await arm(page);
    await sidebar.getByRole("link", { name: "Graph", exact: true }).click();
    await page.waitForTimeout(700);
    expectBudget(await page.evaluate(() => (window as unknown as { __budget: BudgetSample }).__budget));

    // The page after the return must stay inside the same budget.
    await arm(page);
    await sidebar.getByRole("link", { name: "Explore", exact: true }).click();
    await page.waitForTimeout(700);
    expectBudget(await page.evaluate(() => (window as unknown as { __budget: BudgetSample }).__budget));
  });

  test("rapid clicks still land on the last route", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const sidebar = page.getByTestId("sidebar");

    // No waiting between clicks: the router must end on the route clicked last.
    await sidebar.getByRole("link", { name: "Explore", exact: true }).click();
    await sidebar.getByRole("link", { name: "Projects", exact: true }).click();
    await sidebar.getByRole("link", { name: "Inbox", exact: true }).click();

    await expect(page).toHaveURL(/\/inbox\b/);
    await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
  });
});
