import { expect, test } from "@playwright/test";

test("AppPart lazy boots are serialized, themed, handshake-gated and keep their reserved size", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    const Native = window.IntersectionObserver;
    window.IntersectionObserver = class extends Native {
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        super(options?.rootMargin ? () => {} : callback, options);
      }
    };
  });
  let unblock!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  await page.route("**/demo/embed/explore/**", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/basics/__motion/?parts=explore,note");
  const first = page.locator('.app-part[data-part="explore"]');
  const second = page.locator('.app-part[data-part="note"]');
  await first.getByRole("button", { name: "Try it", exact: true }).click();
  await second.getByRole("button", { name: "Try it", exact: true }).click();
  await expect(first).toHaveAttribute("data-state", "loading");
  await expect(second).toHaveAttribute("data-state", "queued");
  expect(await page.locator("iframe").count()).toBe(1);
  const before = await first.evaluate((e) => ({ width: e.clientWidth, height: e.clientHeight, top: (e as HTMLElement).offsetTop }));
  await expect(first.locator("iframe")).toHaveCSS("opacity", "0");
  await page.evaluate(() => window.postMessage({ source: "basics-demo", type: "ready", part: "explore" }, location.origin));
  await expect(first).toHaveAttribute("data-state", "loading");
  expect(await first.locator(".part-skeleton").evaluate((e) => getComputedStyle(e, "::after").animationDuration)).toBe("1.2s");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await first.locator(".part-skeleton").evaluate((e) => getComputedStyle(e, "::after").animationName)).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  unblock();
  await expect(first).toHaveAttribute("data-state", "live");
  await expect(second).toHaveAttribute("data-state", "live");
  expect(await first.evaluate((e) => ({ width: e.clientWidth, height: e.clientHeight, top: (e as HTMLElement).offsetTop }))).toEqual(
    before,
  );
  await expect(first.locator("iframe")).toHaveCSS("transition-duration", "0.2s");
  expect(await first.locator(".part-skeleton").evaluate((e) => getComputedStyle(e, "::after").animationName)).toBe("none");
  const iframe = page.frameLocator('iframe[title="Interactive Basics explore demo"]');
  for (const dark of [true, false]) {
    await page.evaluate((value) => document.documentElement.classList.toggle("dark", value), dark);
    await expect(iframe.locator("html")).toHaveClass(dark ? /dark/ : /^(?!.*dark)/);
  }
});

test("far parts wait, phones require a tap, all five skeletons reserve boxes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/basics/__motion/?parts=explore&distance=300");
  await expect(page.locator(".app-part")).toHaveAttribute("data-state", "idle");
  await expect(page.locator("iframe")).toHaveCount(0);
  await page.locator(".app-part").scrollIntoViewIfNeeded();
  await expect(page.locator(".app-part")).toHaveAttribute("data-state", "live");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/basics/__motion/");
  await expect(page.locator(".app-part")).toHaveCount(5);
  await expect(page.locator("iframe")).toHaveCount(0);
  expect(await page.locator("[data-skeleton]").evaluateAll((elements) => elements.map((e) => e.getAttribute("data-skeleton")))).toEqual([
    "explore",
    "note",
    "proposal",
    "recommend",
    "graph",
  ]);
  const box = page.locator(".app-part").first();
  const height = await box.evaluate((e) => e.clientHeight);
  await box.getByRole("button", { name: "Try it", exact: true }).click();
  await expect(box).toHaveAttribute("data-state", "live");
  expect(await box.evaluate((e) => e.clientHeight)).toBe(height);
  await expect(page.locator("iframe")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});

test("failure and active unmount release queued work", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.install();
  await page.route("**/demo/embed/explore/**", (route) => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/basics/__motion/?parts=explore,note");
  const first = page.locator('.app-part[data-part="explore"]');
  const second = page.locator('.app-part[data-part="note"]');
  await expect(first).toHaveAttribute("data-state", "loading");
  const height = await first.evaluate((e) => e.clientHeight);
  await page.clock.fastForward(16_000);
  await expect(first).toHaveAttribute("data-state", "failed");
  await expect(first.getByRole("link", { name: "Open full demo" })).toHaveAttribute("href", "/basics/demo/");
  expect(await first.evaluate((e) => e.clientHeight)).toBe(height);
  await expect(second).toHaveAttribute("data-state", "live");
  await page.goto("/basics/__motion/?parts=explore,note");
  await expect(first).toHaveAttribute("data-state", "loading");
  await page.getByRole("button", { name: "Remove first part" }).click();
  await expect(first).toHaveCount(0);
  await expect(second).toHaveAttribute("data-state", "live");
});

test("reveal matches exact spec once and reduced motion disables movement and shimmer", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/basics/__motion/?parts=explore&distance=300");
  const heading = page.locator('[data-reveal="1"]');
  await expect(heading).toHaveCSS("opacity", "0");
  await expect(heading).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 6)");
  await expect(heading).toHaveCSS("transition-duration", "0.28s, 0.28s");
  await expect(heading).toHaveCSS("transition-delay", "0.06s");
  await expect(heading).toHaveCSS("transition-timing-function", "cubic-bezier(0.22, 1, 0.36, 1), cubic-bezier(0.22, 1, 0.36, 1)");
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toHaveClass(/is-revealed/);
  await expect(heading).toHaveCSS("opacity", "1");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(heading).toHaveClass(/is-revealed/);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/basics/__motion/?parts=explore&distance=300");
  await expect(heading).toHaveCSS("transform", "none");
  await expect(heading).toHaveCSS("transition-duration", "0.001s");
  await expect(heading).toHaveCSS("transition-delay", "0s");
  expect(await page.locator(".part-skeleton").evaluate((e) => getComputedStyle(e, "::after").animationName)).toBe("none");
});

test("landing is visible without JavaScript, hero has two lines and section gap stays tight", async ({ page, browser }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/basics/");
  await page.evaluate(() => document.fonts.ready);
  const lines = await page
    .locator("#landing-title")
    .evaluate((e) => e.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(e).lineHeight));
  expect(lines).toBeCloseTo(2, 1);
  expect(await page.locator(".landing-window-viewport").evaluate((e) => e.clientWidth / 1280)).toBeGreaterThanOrEqual(0.75);
  expect(await page.locator(".landing-hero").evaluate((e) => Number.parseFloat(getComputedStyle(e).paddingBottom))).toBeLessThanOrEqual(40);
  for (const section of await page.locator(".landing-section").all())
    expect(await section.locator("[data-reveal]").count()).toBeGreaterThanOrEqual(4);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator("#landing-title")).toHaveCSS("transition-duration", "0.001s");
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const noJS = await context.newPage();
  await noJS.goto(new URL("/basics/", page.url()).href);
  await expect(noJS.locator("#landing-title")).toHaveCSS("opacity", "1");
  await expect(noJS.locator("[data-reveal].reveal-armed")).toHaveCount(0);
  const fallbackLinks = noJS.locator("noscript").getByRole("link", { name: "Open live demo" });
  await expect(fallbackLinks).toHaveCount(5);
  for (const link of await fallbackLinks.all()) await expect(link).toBeVisible();
  await context.close();
});
