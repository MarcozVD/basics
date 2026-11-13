import { expect, test } from "@playwright/test";

for (const mode of ["direct", "hero", "embed"]) {
  test(`Explore type, layer, sort and search work in ${mode}`, async ({ page }) => {
    const embedded = mode === "hero";
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(embedded ? "/basics/" : mode === "embed" ? "/basics/demo/embed/explore/" : "/basics/demo/explore/");
    const scope = embedded ? page.frameLocator('iframe[title="Interactive Basics app demo"]') : page;
    await expect(scope.getByRole("heading", { name: "Explore", exact: true })).toBeVisible();
    const filters = scope.locator('fieldset button[aria-haspopup="listbox"]');
    const rows = scope.getByRole("listbox").first().getByRole("option");
    await expect(rows).toHaveCount(25);
    if (embedded) expect(await page.locator(".landing-window-viewport").evaluate((e) => e.clientWidth / 1280)).toBeLessThan(1);
    await filters.nth(0).click();
    await scope.getByRole("option", { name: /^Tech/ }).click();
    await expect(rows).toHaveCount(9);
    await expect(filters.nth(0)).toHaveText("Tech");
    await filters.nth(1).click();
    await scope.getByRole("option", { name: "Frontend", exact: true }).click();
    await expect(rows).toHaveCount(3);
    await expect(filters.nth(1)).toHaveText("Frontend");
    await filters.nth(2).click();
    await scope.getByRole("option", { name: "Title", exact: true }).click();
    await expect(filters.nth(2)).toHaveText("Sort: Title");
    expect(await rows.allTextContents()).toEqual([
      expect.stringMatching(/^Next\.js/),
      expect.stringMatching(/^React/),
      expect.stringMatching(/^TypeScript/),
    ]);
    await scope.getByRole("searchbox").fill("zz-no-such-note");
    await expect(rows).toHaveCount(0);
    await scope.getByRole("searchbox").fill("");
    await expect(rows).toHaveCount(3);
    const url = await scope.locator("body").evaluate(() => location.href);
    expect(url).toContain("type=tech");
    expect(url).toContain("layer=frontend");
    expect(url).toContain("sort=title");
  });
}
