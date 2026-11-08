import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { vaultPath } from "./helpers";

/** Seed the vault's activity log so Home renders its scrollable activity panel. */
function seedActivity(count: number): () => void {
  const dir = path.join(vaultPath(), ".basics");
  const file = path.join(dir, "activity.jsonl");
  fs.mkdirSync(dir, { recursive: true });
  const previous = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const now = Date.now();
  const lines = Array.from({ length: count }, (_, index) =>
    JSON.stringify({
      // Alternating agents keep every event its own row instead of collapsing into groups.
      ts: new Date(now - index * 60_000).toISOString(),
      agent: index % 2 === 0 ? "claude-code" : "opencode",
      tool: "get_note",
      noteIds: ["fastapi"],
    }),
  );
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
  return () => {
    if (previous === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, previous);
  };
}

/** Wait for the route to render, then for the late Geist swap so measurements are stable. */
async function settle(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => document.querySelector("main h1") !== null);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        void document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }),
  );
}

interface LayoutMetrics {
  h1Left: number | null;
  mainLeft: number | null;
}

async function measureHome(page: import("@playwright/test").Page): Promise<LayoutMetrics> {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("main");
    const mainBox = main?.getBoundingClientRect();
    const h1 = document.querySelector<HTMLElement>("h1")?.getBoundingClientRect();
    return {
      h1Left: h1 ? h1.left : null,
      mainLeft: mainBox ? mainBox.left : null,
    };
  });
}

test("Home keeps the page gutter and scrolls as one column on desktop sizes", async ({ page }) => {
  const restoreActivity = seedActivity(6);
  try {
    for (const { width, height, gutter } of [
      { width: 1280, height: 820, gutter: 40 },
      { width: 900, height: 700, gutter: 32 },
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(page.getByTestId("continue-list")).toBeVisible();
      await settle(page);

      const m = await measureHome(page);

      // The page title starts one gutter inside the scroll container at this width.
      expect(m.mainLeft).not.toBeNull();
      expect(m.h1Left).not.toBeNull();
      expect((m.h1Left as number) - (m.mainLeft as number)).toBe(gutter);

      // Home is a single column now: there is no grid or nested activity panel to cap.
      await expect(page.getByTestId("activity-panel")).toHaveCount(0);
      await expect(page.getByTestId("home-grid")).toHaveCount(0);
    }
  } finally {
    restoreActivity();
  }
});

test("every page shares the panel gutter", async ({ page }) => {
  for (const route of ["/", "/explore", "/projects", "/inbox", "/recommend"]) {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto(route);
    await settle(page);
    const m = await measureHome(page);
    expect(m.mainLeft, `main left on ${route}`).not.toBeNull();
    expect(m.h1Left, `page title left on ${route}`).not.toBeNull();
    expect((m.h1Left as number) - (m.mainLeft as number), `page title offset on ${route}`).toBe(40);
  }
});

test("a browser keeps its own window chrome: no window strip, buttons or drag region", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto("/");
  await settle(page);

  // The custom window strip belongs to the desktop app only: same UI, native window here.
  await expect(page.getByTestId("content-panel")).toBeVisible();
  await expect(page.getByTestId("window-controls")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Minimize" })).toHaveCount(0);
  await expect(page.getByTestId("title-strip")).toHaveCount(0);
  await expect(page.locator("[data-tauri-drag-region]")).toHaveCount(0);
});

test("a browser keeps its own shortcuts: Ctrl+F and right-click are not taken over", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto("/");
  await settle(page);

  // The desktop key filter is installed only in the app (see useDesktopShell).
  const find = await page.evaluate(() => {
    const event = new KeyboardEvent("keydown", { key: "f", ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(find).toBe(false);
  await expect(page.getByRole("dialog", { name: "Command palette" })).toHaveCount(0);

  const menu = await page.evaluate(() => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(menu).toBe(false);
});

test("the sidebar collapses to a rail and back, following the window width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto("/");
  await settle(page);

  const sidebar = page.getByTestId("sidebar");
  await expect(sidebar).toBeVisible();
  expect(Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(224);

  // An explicit choice wins over the width default and is remembered.
  await page.getByTestId("sidebar-toggle").click();
  await expect.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(64);
  expect(await page.evaluate(() => localStorage.getItem("basics:sidebar"))).toBe("collapsed");

  await page.reload();
  await settle(page);
  await expect.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(64);
  expect(await page.evaluate(() => localStorage.getItem("basics:sidebar"))).toBe("collapsed");

  await page.getByTestId("sidebar-toggle").click();
  await expect.poll(async () => Math.round((await sidebar.boundingBox())?.width ?? 0)).toBe(224);
});

test("on a narrow window the sidebar hides behind a menu button that opens a drawer", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 800 });
  await page.goto("/");
  await settle(page);

  await expect(page.getByTestId("sidebar")).toHaveCount(0);
  const menu = page.getByTestId("sidebar-menu");
  await expect(menu).toBeVisible();

  await menu.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("navigation")).toBeVisible();

  // Escape closes it and focus returns to the button that opened it.
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(menu).toBeFocused();
});

test("the shell fits a 320px browser and the 900x600 minimum window", async ({ page }) => {
  for (const { width, height } of [
    { width: 320, height: 640 },
    { width: 900, height: 600 },
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await settle(page);

    await expect(page.getByTestId("content-panel")).toBeVisible();
    // Nothing sticks out sideways: the panel keeps the page inside the window.
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${width}x${height} horizontal overflow`).toBeLessThanOrEqual(1);

    if (width < 768) {
      await expect(page.getByTestId("sidebar")).toHaveCount(0);
      await expect(page.getByTestId("sidebar-menu")).toBeVisible();
    } else {
      await expect(page.getByTestId("sidebar")).toBeVisible();
      // Between 768 and 1279 the column is the 64px icon rail.
      expect(Math.round((await page.getByTestId("sidebar").boundingBox())?.width ?? 0)).toBe(64);
    }
  }
});
