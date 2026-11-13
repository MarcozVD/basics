import { expect, test } from "@playwright/test";

const features = [
  { id: "recommend", title: "Your agent guesses your stack.", parts: ["recommend"] },
  { id: "inbox", title: "Agents rewrite your notes behind your back.", parts: ["proposal"] },
  { id: "graph", title: "Your knowledge is scattered in chats.", parts: ["note", "graph"] },
  { id: "export-connect", title: "You paste the same rules every project.", parts: ["explore"] },
];

for (const feature of features) {
  test(`${feature.id}: desktop content, real embeds and linked pages`, async ({ page, request }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/basics/features/${feature.id}/`);
    const article = page.locator(".feature-page");
    await expect(article.getByRole("heading", { level: 1 })).toHaveText(feature.title);
    await expect(article.getByRole("heading", { level: 2 })).toHaveCount(3);
    for (const part of feature.parts) {
      const embed = article.locator(`.app-part[data-part="${part}"]`);
      await embed.scrollIntoViewIfNeeded();
      await expect(embed).toHaveAttribute("data-state", "live", { timeout: 30000 });
      await expect(embed.locator("iframe")).toHaveAttribute("title", `Interactive Basics ${part} demo`);
    }
    for (const link of await article
      .locator(".feature-guide a, .feature-pagination a")
      .evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href))) {
      expect((await request.get(link)).status()).toBe(200);
    }
    await page.getByRole("button", { name: "Product", exact: true }).click();
    for (const item of features) await expect(page.locator(`.VPNavBarMenuGroup a[href="/basics/features/${item.id}/"]`)).toBeVisible();
    await page.getByRole("button", { name: "Product", exact: true }).click();
    const next = article.locator(".feature-pagination a").last();
    await next.click();
    await expect(page.locator(".feature-page h1")).not.toHaveText(feature.title);
    await expect(page.locator(".feature-page h1")).toHaveClass(/is-revealed/);
    expect(errors).toEqual([]);
  });

  test(`${feature.id}: 390px static fallback and explicit Try it`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/basics/features/${feature.id}/`);
    const article = page.locator(".feature-page");
    await expect(article.getByRole("heading", { level: 1 })).toHaveText(feature.title);
    await expect(article.locator("iframe")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const first = article.locator(".app-part").first();
    await first.getByRole("button", { name: "Try it", exact: true }).click();
    await expect(first).toHaveAttribute("data-state", "live", { timeout: 30000 });
    await expect(article.locator("iframe")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("feature copy and demo links remain available without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const feature of features) {
    await page.goto(`http://127.0.0.1:${process.env.BASICS_DEMO_TEST_PORT || "4860"}/basics/features/${feature.id}/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(feature.title);
    await expect(page.locator(".feature-page noscript a").first()).toBeVisible();
  }
  await context.close();
});
