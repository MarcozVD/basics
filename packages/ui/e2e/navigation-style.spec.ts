import { expect, type Page, test } from "@playwright/test";

/** Choose Floating in Settings > General and wait for the bar to take over. */
async function useFloating(page: Page) {
  await page.goto("/settings");
  await page.getByText("Floating", { exact: true }).click();
  await expect(page.getByTestId("floating-nav")).toBeVisible();
  await expect(page.getByTestId("sidebar")).toBeHidden();
}

/** Drag the grip toward one edge; the bar must snap there, never in between. */
async function dragToEdge(page: Page, edge: "top" | "bottom" | "left" | "right") {
  const grip = page.getByTestId("nav-grip");
  const box = await grip.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("missing grip or viewport");
  const target = {
    top: { x: viewport.width / 2, y: 40 },
    bottom: { x: viewport.width / 2, y: viewport.height - 40 },
    left: { x: 40, y: viewport.height / 2 },
    right: { x: viewport.width - 40, y: viewport.height / 2 },
  }[edge];
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId("floating-nav")).toHaveAttribute("data-edge", edge);
}

/** Scroll to the end the bar anchors, then assert no interactive element sits under it. */
async function expectNothingUnderBar(page: Page, edge: "top" | "bottom" | "left" | "right") {
  await page.evaluate((target) => {
    const main = document.querySelector("main");
    if (main) main.scrollTop = target === "bottom" ? main.scrollHeight : 0;
  }, edge);
  // The bar springs to the edge: wait until its box stops moving before measuring.
  const bar = page.getByTestId("floating-nav");
  let previous: { x: number; y: number } | null = null;
  for (let attempt = 0; attempt < 40; attempt++) {
    const box = await bar.boundingBox();
    if (!box) break;
    if (previous && Math.abs(previous.x - box.x) < 0.5 && Math.abs(previous.y - box.y) < 0.5) break;
    previous = { x: box.x, y: box.y };
    await page.waitForTimeout(50);
  }
  const barBox = await page.getByTestId("floating-nav").boundingBox();
  if (!barBox) throw new Error("no floating bar");
  const hits = await page.evaluate((rect) => {
    const selector = 'main a, main button, main input, main select, main textarea, main [tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter((el) => {
        if (el.closest('[data-testid="floating-nav"]')) return false;
        const box = el.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) return false;
        return !(box.right <= rect.x || box.left >= rect.x + rect.width || box.bottom <= rect.y || box.top >= rect.y + rect.height);
      })
      .map((el) => {
        const box = el.getBoundingClientRect();
        const label = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? el.tagName;
        return `${label} [${Math.round(box.top)}..${Math.round(box.bottom)}]`;
      });
  }, barBox);
  expect(hits, `edge=${edge} bar=${JSON.stringify(barBox)}`).toEqual([]);
}

test("switches to the floating bar and remembers it after a reload", async ({ page }) => {
  await useFloating(page);
  await expect(page.getByTestId("floating-nav")).toHaveAttribute("data-edge", "bottom");

  await page.reload();
  await expect(page.getByTestId("floating-nav")).toBeVisible();
  await expect(page.getByTestId("sidebar")).toBeHidden();
  await expect(page.getByTestId("floating-nav")).toHaveAttribute("data-edge", "bottom");
});

test("drag snaps to each edge and survives a reload", async ({ page }) => {
  await useFloating(page);
  for (const edge of ["top", "left", "right", "bottom"] as const) {
    await dragToEdge(page, edge);
    await page.reload();
    await expect(page.getByTestId("floating-nav")).toBeVisible();
    await expect(page.getByTestId("floating-nav")).toHaveAttribute("data-edge", edge);
  }
});

test("arrow keys on the grip move the bar and announce the edge", async ({ page }) => {
  await useFloating(page);
  const grip = page.getByTestId("nav-grip");
  await grip.focus();
  await grip.press("ArrowUp");
  await expect(page.getByTestId("floating-nav")).toHaveAttribute("data-edge", "top");
  await expect(page.getByText("Navigation bar moved to Top.")).toBeAttached();
  await grip.press("ArrowLeft");
  await expect(page.getByTestId("floating-nav")).toHaveAttribute("data-edge", "left");
  await expect(page.getByText("Navigation bar moved to Left.")).toBeAttached();
});

test("nothing interactive sits under the bar on any edge", async ({ page }) => {
  await useFloating(page);
  await page.goto("/explore");
  await expect(page.getByTestId("floating-nav")).toBeVisible();
  const grip = page.getByTestId("nav-grip");
  for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"] as const) {
    const edge = { ArrowUp: "top", ArrowDown: "bottom", ArrowLeft: "left", ArrowRight: "right" }[key] as
      | "top"
      | "bottom"
      | "left"
      | "right";
    await grip.focus();
    await grip.press(key);
    await expect(page.getByTestId("floating-nav")).toHaveAttribute("data-edge", edge);
    await expectNothingUnderBar(page, edge);
  }
});

test("every route navigates from the floating bar", async ({ page }) => {
  await useFloating(page);
  const bar = page.getByTestId("floating-nav");
  const routes: [string, RegExp][] = [
    ["Home", /\/$/],
    ["Explore", /\/explore$/],
    ["Projects", /\/projects(\/|$)/],
    ["Graph", /\/graph$/],
    ["Inbox", /\/inbox$/],
    ["Recommend", /\/recommend$/],
    ["Skills", /\/skills$/],
    ["Settings", /\/settings$/],
  ];
  for (const [name, url] of routes) {
    await bar.getByRole("link", { name }).click();
    await expect(page).toHaveURL(url);
  }
});

test("small windows fall back to the drawer and restore the stored style", async ({ page }) => {
  await useFloating(page);
  await page.setViewportSize({ width: 700, height: 800 });
  await expect(page.getByTestId("floating-nav")).toBeHidden();
  await expect(page.getByTestId("sidebar-menu")).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.getByTestId("floating-nav")).toBeVisible();
  await expect(page.getByTestId("sidebar")).toBeHidden();
});

test("a left edge fits the minimum 900x600 window", async ({ page }) => {
  await useFloating(page);
  await page.setViewportSize({ width: 900, height: 600 });
  await page.getByText("Left", { exact: true }).click();
  await expect(page.getByTestId("floating-nav")).toHaveAttribute("data-edge", "left");
});
