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
/** Hover is a per-frame interaction, so its burst budget matches the page budget. */
const HOVER_BUDGET_MS = 150;

interface BudgetSample {
  t0: number;
  long: { start: number; duration: number }[];
  frames: number[];
}

interface HoverSample extends BudgetSample {
  sampling: boolean;
}

interface HoverCyNode {
  id: () => string;
  isParent: () => boolean;
  data: (key: string) => unknown;
  renderedBoundingBox: (options: { includeLabels: boolean }) => { x1: number; y1: number; x2: number; y2: number };
}

interface HoverCyGraph {
  nodes: () => { filter: (fn: (node: HoverCyNode) => boolean) => { map: <T>(fn: (node: HoverCyNode) => T) => T[] } };
  nodes: (selector: string) => { length: number };
}

/** The 20 nodes a sweep crosses: spread over the picture, never a compound box. */
async function hoverPoints(page: Page): Promise<{ id: string; x: number; y: number }[]> {
  return page.evaluate(() => {
    const cy = (window as unknown as { __basicsCy?: HoverCyGraph }).__basicsCy;
    const host = document.querySelector('[data-testid="graph-canvas"]') as HTMLElement | null;
    if (!cy || !host) throw new Error("graph canvas not available");
    const rect = host.getBoundingClientRect();
    const nodes = cy
      .nodes()
      .filter((node) => !node.isParent() && !node.data("bandLabel") && !node.data("spacer"))
      .map((node) => {
        const box = node.renderedBoundingBox({ includeLabels: false });
        return { id: node.id(), x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
      })
      .filter((point) => point.x > 8 && point.y > 8 && point.x < rect.width - 8 && point.y < rect.height - 8);
    if (nodes.length < 8) throw new Error(`only ${nodes.length} nodes to hover`);
    const count = Math.min(20, nodes.length);
    const step = nodes.length / count;
    return Array.from({ length: count }, (_, index) => nodes[Math.floor(index * step)]);
  });
}

/**
 * Sweeps the pointer across nodes and returns the worst frame gap and long tasks of that
 * burst. `passes` walks the set in alternating order so adjacent nodes are crossed both ways.
 */
async function hoverSweep(page: Page, passes = 2): Promise<{ worstGap: number; long: number[] }> {
  const points = await hoverPoints(page);
  const origin = await page.getByTestId("graph-canvas").boundingBox();
  if (!origin) throw new Error("graph canvas has no geometry");

  await page.evaluate(() => {
    const win = window as unknown as { __hoverSample?: HoverSample };
    const sample: HoverSample = { t0: performance.now(), long: [], frames: [], sampling: true };
    win.__hoverSample = sample;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) sample.long.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ entryTypes: ["longtask"] });
    const tick = (ts: number) => {
      sample.frames.push(ts);
      if (sample.sampling) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // Start outside the picture, then touch every node and leave each time.
  await page.mouse.move(origin.x + 4, origin.y + 4);
  for (let pass = 0; pass < passes; pass++) {
    const order = pass % 2 === 0 ? points : [...points].reverse();
    for (const point of order) {
      await page.mouse.move(origin.x + point.x, origin.y + point.y, { steps: 1 });
      await page.waitForTimeout(40);
    }
    await page.mouse.move(origin.x + 4, origin.y + 4);
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => {
    (window as unknown as { __hoverSample?: HoverSample }).__hoverSample!.sampling = false;
  });
  await page.waitForTimeout(80);

  return page.evaluate(() => {
    const sample = (window as unknown as { __hoverSample: HoverSample }).__hoverSample;
    let worstGap = 0;
    for (let index = 1; index < sample.frames.length; index++) {
      worstGap = Math.max(worstGap, sample.frames[index] - sample.frames[index - 1]);
    }
    const long = sample.long.filter((entry) => entry.start >= sample.t0 - 2).map((entry) => entry.duration);
    return { worstGap, long };
  });
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

async function arm(page: Page, trigger: "click" | "keydown" = "click", key?: string): Promise<void> {
  await page.evaluate(
    ({ trigger, key }) => {
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
      const start = () => {
        sample.t0 = performance.now();
        sample.long.length = 0;
        sample.frames.length = 0;
        const tick = (ts: number) => {
          sample.frames.push(ts);
          if (performance.now() - sample.t0 < 450) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      };
      if (trigger === "click") {
        document.addEventListener("click", start, { capture: true, once: true });
        return;
      }
      const onKeyDown = (event: KeyboardEvent) => {
        if (key !== undefined && event.key !== key) return;
        document.removeEventListener("keydown", onKeyDown, true);
        start();
      };
      document.addEventListener("keydown", onKeyDown, true);
    },
    { trigger, key },
  );
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

/** Worst frame gap inside the first `windowMs` after the click, ignoring later frames. */
function worstFrameGap(sample: BudgetSample, windowMs: number): number {
  let worst = 0;
  for (let index = 1; index < sample.frames.length; index++) {
    if (sample.frames[index] - sample.t0 > windowMs) break;
    worst = Math.max(worst, sample.frames[index] - sample.frames[index - 1]);
  }
  return worst;
}

// Headless windows can be treated as occluded or backgrounded, which throttles rAF and
// turns an idle frame into a false 50–80ms stall.
test.use({
  launchOptions: {
    args: [
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-features=CalculateNativeWinOcclusion",
    ],
  },
});

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

  test("Home paints its async blocks without layout shift", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    // Layout shift starts at navigation, so the observer has to exist before the app boots.
    await page.addInitScript(() => {
      const win = window as unknown as { __cls?: number };
      win.__cls = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) win.__cls = (win.__cls ?? 0) + entry.value;
        }
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto("/");
    await expect(page.getByTestId("health-line")).toBeVisible();
    await expect(page.getByTestId("continue-list")).toBeVisible();
    await page.waitForTimeout(1200);

    const cls = await page.evaluate(() => (window as unknown as { __cls?: number }).__cls ?? 0);
    // The reserved health, continue and activity heights keep late data from moving the page.
    expect(cls).toBeLessThan(0.05);
  });

  test("returning to Home keeps the first 340ms under the frame-gap budget", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    // Home is the landing page; measure a return to it, the common flow. Its first mount in
    // the session pays the page-transition setup once (covered by the cold budget).
    await page.goto("/");
    await expect(page.getByTestId("continue-list")).toBeVisible();
    await page.waitForTimeout(700);
    const sidebar = page.getByTestId("sidebar");
    await sidebar.getByRole("link", { name: "Projects", exact: true }).click();
    await expect(page).toHaveURL(/\/projects/);
    await page.waitForTimeout(700);

    // One frame gap on a shared CI machine occasionally catches a scheduler stall; the
    // median of three navigations is the stable measure of what a person actually sees.
    const gaps: number[] = [];
    for (let run = 0; run < 3; run++) {
      if (run > 0) {
        await sidebar.getByRole("link", { name: "Projects", exact: true }).click();
        await expect(page).toHaveURL(/\/projects/);
        await page.waitForTimeout(500);
      }
      await arm(page);
      await sidebar.getByRole("link", { name: "Home", exact: true }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByTestId("continue-list")).toBeVisible();
      await page.waitForTimeout(500);
      const sample = await page.evaluate(() => (window as unknown as { __budget: BudgetSample }).__budget);
      gaps.push(worstFrameGap(sample, CLICK_WINDOW_MS));
      expectBudget(sample);
    }
    // rAF timestamps land on refresh boundaries, so 50.0 is the 50ms budget at this
    // resolution rather than a miss; the occasional 66/83ms stall is the outlier the
    // median ignores.
    expect(gaps.sort((a, b) => a - b)[1]).toBeLessThanOrEqual(50);
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

  test("leaving the graph with a G-chord during its first layout does not block the next page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);
    const sidebar = page.getByTestId("sidebar");

    // A shortcut does not go through a link click: the helper has to signal the same intent.
    await sidebar.getByRole("link", { name: "Graph", exact: true }).click();
    await page.waitForTimeout(700);
    await arm(page, "keydown", "i");
    await page.keyboard.press("g");
    await page.keyboard.press("i");
    await expect(page).toHaveURL(/\/inbox\b/);
    await page.waitForTimeout(700);

    expectBudget(await page.evaluate(() => (window as unknown as { __budget: BudgetSample }).__budget));
  });

  test("leaving the graph with Alt+Left during its first layout does not block the next page", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForTimeout(500);
    const sidebar = page.getByTestId("sidebar");

    // A history move is only observable through popstate: the capture listener must signal
    // before React Router handles the same event.
    await sidebar.getByRole("link", { name: "Graph", exact: true }).click();
    await page.waitForTimeout(700);
    await arm(page, "keydown", "ArrowLeft");
    await page.keyboard.press("Alt+ArrowLeft");
    await expect(page).toHaveURL(/\/$/);
    await page.waitForTimeout(700);

    expectBudget(await page.evaluate(() => (window as unknown as { __budget: BudgetSample }).__budget));
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

  /**
   * The graph is the one page whose pointer interaction used to restyle hundreds of
   * elements per node. A sweep has to stay in the same budget as a page click.
   */
  const hoverTest = (mode: "free" | "grouped") =>
    test(`hovering nodes in the ${mode} graph stays inside the frame budget`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 820 });
      await page.addInitScript((grouped) => {
        (window as unknown as { __BASICS_E2E__: boolean }).__BASICS_E2E__ = true;
        localStorage.setItem("basics:graph-group", grouped ? "1" : "0");
      }, mode === "grouped");
      await page.goto("/graph");
      await expect(page.getByTestId("graph-canvas").locator("canvas").first()).toBeVisible({ timeout: 120_000 });
      await expect
        .poll(
          () =>
            page.evaluate(() => {
              const cy = (window as unknown as { __basicsCy?: HoverCyGraph }).__basicsCy;
              const perf = (
                window as unknown as {
                  __basicsGraphPerf?: { mounts: { settledAt: number | null }[] };
                }
              ).__basicsGraphPerf;
              const last = perf?.mounts[perf.mounts.length - 1];
              return Boolean(cy && cy.nodes().length > 150 && last?.settledAt != null);
            }),
          { timeout: 180_000 },
        )
        .toBe(true);
      await page.waitForTimeout(900);

      // The first sweep warms styles and labels; the second is what a reader feels.
      await hoverSweep(page, 1);
      const { worstGap, long } = await hoverSweep(page, 2);
      expect(worstGap).toBeLessThan(HOVER_BUDGET_MS);
      for (const duration of long) expect(duration).toBeLessThan(HOVER_BUDGET_MS);

      // The sweep really highlighted a node and faded the rest (it left the picture last).
      const points = await hoverPoints(page);
      const origin = await page.getByTestId("graph-canvas").boundingBox();
      if (!origin) throw new Error("graph canvas has no geometry");
      await page.mouse.move(origin.x + points[0].x, origin.y + points[0].y, { steps: 1 });
      await page.waitForTimeout(120);
      const highlighted = await page.evaluate(() => {
        const cy = (window as unknown as { __basicsCy?: HoverCyGraph }).__basicsCy;
        return { lit: cy?.nodes(".lit").length ?? 0, fade: cy?.nodes(".fade").length ?? 0 };
      });
      expect(highlighted.lit).toBeGreaterThan(0);
      expect(highlighted.fade).toBeGreaterThan(0);
    });

  hoverTest("free");
  hoverTest("grouped");
});
