import { expect, test } from "@playwright/test";

test("late fonts do not move mobile header controls or install Copy", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  let releaseFonts = () => {};
  const gate = new Promise<void>((resolve) => {
    releaseFonts = resolve;
  });
  await page.route("**/*.woff2", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/basics/", { waitUntil: "domcontentloaded" });
    await expect(page.locator(".landing-command button")).toBeVisible();
    const positions = () =>
      page
        .locator(".VPNavBar .container > .content, .landing-command button")
        .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().x));
    const before = await positions();
    releaseFonts();
    await page.evaluate(() => document.fonts.ready);
    const after = await positions();
    for (let index = 0; index < before.length; index++) expect(Math.abs(after[index] - before[index])).toBeLessThan(0.5);
  } finally {
    releaseFonts();
  }
});

for (const theme of ["light", "dark"]) {
  test(`desktop ${theme}: search keyboard focus and iframe exit remain usable`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.addInitScript((value) => localStorage.setItem("vitepress-theme-appearance", value), theme);
    await page.goto("/basics/features/recommend/");
    const search = page.getByRole("button", { name: "Search K", exact: true });
    await search.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "Search documentation" })).toBeVisible();
    await expect(page.locator("#localsearch-input")).toBeFocused();
    await page.locator("#localsearch-input").fill("desktop");
    await expect(page.getByRole("option").first()).toBeVisible();
    await page.keyboard.press("ArrowDown");
    const active = await page.locator("#localsearch-input").getAttribute("aria-activedescendant");
    expect(active).toBeTruthy();
    await expect(page.locator(`#${active}`)).toHaveAttribute("role", "option");
    await expect(page.locator(`#${active}`)).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("Escape");
    await expect(page.locator("#localsearch-input")).toHaveCount(0);
    await expect(search).toBeFocused();
    await page.keyboard.press("Enter");
    await page.locator("#localsearch-input").fill("desktop");
    const selected = page.getByRole("option", { selected: true });
    await expect(selected).toBeVisible();
    const destination = new URL((await selected.getAttribute("href"))!, page.url()).href;
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(destination);
    await page.goto("/basics/features/recommend/");
    const part = page.locator('.app-part[data-part="recommend"]');
    await part.scrollIntoViewIfNeeded();
    await expect(part).toHaveAttribute("data-state", "live", { timeout: 30000 });
    const iframe = part.locator("iframe");
    await expect(iframe).toHaveAttribute("title", "Interactive Basics recommend demo");
    const frame = page.frameLocator('iframe[title="Interactive Basics recommend demo"]');
    const controls = frame.locator('a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]').filter({ visible: true });
    await controls.last().focus();
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe("IFRAME");
  });

  test(`375px ${theme}: guides share tokens, keyboard nav and heading-only replay`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript((value) => localStorage.setItem("vitepress-theme-appearance", value), theme);
    await page.goto("/basics/guide/getting-started.html");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#VPContent")).toBeFocused();
    const menu = page.getByRole("button", { name: "mobile navigation", exact: true });
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    const product = page.locator(".VPNavScreen").getByRole("button", { name: "Product", exact: true });
    await product.focus();
    await page.keyboard.press("Enter");
    const recommend = page.locator(".VPNavScreen").getByRole("link", { name: "Recommend", exact: true });
    await expect(recommend).toBeVisible();
    await recommend.focus();
    await expect(recommend).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/features\/recommend\/$/);
    for (const route of ["guide/getting-started.html", "reference/cli.html", "guide/desktop.html"]) {
      await page.goto(`/basics/${route}`);
      const doc = page.locator(".vp-doc");
      await expect(doc.locator("h2").first()).toHaveClass(/reveal-armed/);
      await expect(doc.locator("p.reveal-armed, li.reveal-armed, pre.reveal-armed")).toHaveCount(0);
      await expect(page.getByRole("contentinfo", { name: "Basics footer" })).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
      expect(await doc.evaluate((element) => getComputedStyle(element).color)).toBe(
        theme === "dark" ? "rgb(242, 242, 242)" : "rgb(17, 17, 19)",
      );
    }
  });
}

test("download CTAs and copied URL lead to the asset guide; video lives only there", async ({ page, context, request }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/basics/");
  const ctas = page.getByRole("link", { name: "Download desktop", exact: true });
  await expect(ctas).toHaveCount(2);
  for (const cta of await ctas.all()) await expect(cta).toHaveAttribute("href", "/basics/guide/desktop.html#download");
  await expect(page.locator("video")).toHaveCount(0);
  await ctas.first().click();
  await expect(page.locator("#download")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: /^Download desktop/ })).toHaveAttribute("id", "download");
  await expect(page.getByRole("link", { name: 'Permalink to "Download desktop"', exact: true })).toHaveAttribute("href", "#download");
  await expect(page.locator("#download")).not.toContainText("{#download}");
  await expect(page.locator("#install")).toHaveCount(1);
  const releases = page.getByRole("link", { name: "all desktop releases", exact: true });
  await expect(releases).toHaveAttribute("href", /releases\?q=desktop-v&expanded=true/);
  for (const asset of ["x64_en-US.msi", "x64-setup.exe", "universal.dmg", "amd64.AppImage", "amd64.deb", "x86_64.rpm"])
    await expect(page.locator(".vp-doc")).toContainText(asset);
  const video = page.getByLabel("Basics desktop tour, silent video");
  await expect(video).toHaveAttribute("controls", "");
  await expect(video).toHaveAttribute("preload", "none");
  await expect(video).not.toHaveAttribute("autoplay", "");
  await expect(video).toHaveAttribute("aria-describedby", "desktop-tour-description");
  await expect(page.getByText("Text version of the tour", { exact: true })).toBeVisible();
  expect((await request.get("/basics/media/basics-demo.mp4")).status()).toBe(200);
  await page.goto("/basics/reference/cli.html");
  await expect(page.locator(".vp-doc")).toContainText("--vault <dir>");
  await expect(page.locator(".vp-doc dir, .vp-doc name")).toHaveCount(0);
});
