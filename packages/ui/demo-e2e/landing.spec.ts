import { expect, test } from "@playwright/test";

test("landing hero shows its poster and starts the real app after interaction", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.addInitScript(() => {
    // Prevent automatic visibility loading so this test exercises the first-interaction path.
    window.IntersectionObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    } as unknown as typeof IntersectionObserver;
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => {} } });
  });
  await page.goto("/basics/");
  const hero = page.getByTestId("landing-hero");
  await expect(hero.getByRole("heading", { level: 1 })).toHaveText("Your agents build it your way.");
  await expect(hero).toContainText("Teach your stack once.");
  await expect(hero.getByRole("link", { name: /Download desktop/ })).toHaveAttribute(
    "href",
    "https://github.com/MarcozVD/basics/releases/latest",
  );
  const poster = hero.getByRole("img");
  await expect(poster).toBeVisible();
  await expect.poll(() => poster.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(hero.locator("iframe")).toHaveCount(0);
  await hero.getByRole("button", { name: "Copy install command", exact: true }).click();
  await expect(hero.getByRole("button", { name: "Copied install command", exact: true })).toBeVisible();
  await hero.getByRole("button", { name: /Try live demo/ }).click();
  await expect(page.getByTestId("landing-window")).toHaveAttribute("data-state", "live", { timeout: 20_000 });
  await expect(
    page.frameLocator('iframe[title="Interactive Basics app demo"]').getByRole("heading", { name: "Explore", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("phone hero remains a poster with a live-demo link and no horizontal scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/basics/");
  const hero = page.getByTestId("landing-hero");
  await expect(hero.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(hero.getByRole("img")).toBeVisible();
  await expect(hero.getByRole("link", { name: /Open live demo/ })).toHaveAttribute("href", "/basics/demo/");
  await expect(hero.locator("iframe")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("an unavailable embedded demo keeps its poster and standalone link", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.install();
  await page.route("**/basics/demo/**", (route) => route.fulfill({ status: 503, contentType: "text/plain", body: "Unavailable" }));
  await page.goto("/basics/");
  await expect(page.getByTestId("landing-window")).toHaveAttribute("data-state", "loading");
  await page.clock.fastForward(16_000);
  await expect(page.getByTestId("landing-window")).toHaveAttribute("data-state", "failed");
  await expect(page.getByTestId("landing-hero").getByRole("img")).toBeVisible();
  await expect(page.getByRole("link", { name: /Open live demo/ })).toHaveAttribute("href", "/basics/demo/");
  await expect(page.getByText("The embedded demo could not start. Open it in a new tab.")).toBeVisible();
});
