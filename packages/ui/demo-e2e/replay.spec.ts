import { expect, test } from "@playwright/test";

test("opening geometry survives deferred CSS in both themes and viewport sizes", async ({ page }) => {
  for (const width of [390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"]) {
      await page.addInitScript((value) => localStorage.setItem("vitepress-theme-appearance", value), theme);
      for (const [route, selector] of [
        ["/basics/", ".landing-summary"],
        ["/basics/features/recommend/", ".feature-answer"],
      ]) {
        let resumeStyles!: () => void;
        const styles = new Promise<void>((resolve) => {
          resumeStyles = resolve;
        });
        await page.route("**/assets/style.*.css", async (request) => {
          await styles;
          await request.continue();
        });
        await page.goto(route, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator("h1")).toHaveCSS("opacity", "1");
        const elements = page.locator(`.VPNavBarTitle, h1, ${selector}, .feature-reading`);
        const before = await elements.evaluateAll((nodes) =>
          nodes.map((node) => {
            const { x, y, width, height } = node.getBoundingClientRect();
            return { x, y, width, height };
          }),
        );
        resumeStyles();
        await page.waitForFunction(() => Boolean(document.querySelector<HTMLLinkElement>('link[media="all"]')?.sheet));
        await expect(page.locator("h1")).toHaveCSS("opacity", "1");
        await expect(page.locator("h1")).toHaveCSS("transform", "none");
        const after = await elements.evaluateAll((nodes) =>
          nodes.map((node) => {
            const { x, y, width, height } = node.getBoundingClientRect();
            return { x, y, width, height };
          }),
        );
        for (let index = 0; index < before.length; index++) {
          for (const dimension of ["x", "y", "width", "height"] as const) {
            expect(Math.abs(before[index][dimension] - after[index][dimension])).toBeLessThan(0.5);
          }
        }
        await page.unroute("**/assets/style.*.css");
      }
    }
  }
});

test("mobile LCP summaries stay painted before and through hydration", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const [route, selector] of [
    ["/basics/", ".landing-summary"],
    ["/basics/features/recommend/", ".feature-answer"],
  ]) {
    let resumeHydration!: () => void;
    const hydration = new Promise<void>((resolve) => {
      resumeHydration = resolve;
    });
    await page.route("**/assets/app.*.js", async (request) => {
      await hydration;
      await request.continue();
    });
    await page.goto(route, { waitUntil: "commit" });
    const summary = page.locator(selector);
    await expect(summary).toHaveCSS("opacity", "1");
    await summary.evaluate((element) => {
      const check = () => {
        const style = getComputedStyle(element);
        if (style.opacity !== "1" || style.transform !== "none") element.setAttribute("data-hidden-during-hydration", "true");
      };
      new MutationObserver(check).observe(element, { attributes: true });
    });
    resumeHydration();
    await expect(page.locator("h1")).toHaveClass(/is-revealed/);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await summary.scrollIntoViewIfNeeded();
    await expect(summary).toHaveCSS("opacity", "1");
    await expect(summary).toHaveCSS("transform", "none");
    await expect(summary).not.toHaveAttribute("data-hidden-during-hydration", "true");
    await page.unroute("**/assets/app.*.js");
  }
});

test("landing replays in both scroll directions, keeps partial entries and preserves live frames", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/basics/");
  const heading = page.locator('#your-stack [data-reveal="1"]');
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toHaveClass(/is-revealed/);
  await heading.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    window.scrollTo(0, scrollY + rect.top + rect.height * 0.9);
  });
  await expect(heading).toHaveClass(/is-revealed/);
  await heading.evaluate((element) => window.scrollBy(0, element.getBoundingClientRect().bottom + 1));
  await expect(heading).not.toHaveClass(/is-revealed/);
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toHaveClass(/is-revealed/);
  const part = page.locator('.landing-section .app-part[data-part="recommend"]');
  await part.scrollIntoViewIfNeeded();
  await expect(part).toHaveAttribute("data-state", "live", { timeout: 30000 });
  const frame = page.frameLocator('iframe[title="Interactive Basics recommend demo"]');
  await frame.locator("body").evaluate((body) => {
    body.dataset.replayMarker = "preserved";
  });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(part).not.toHaveClass(/is-revealed/);
  await expect(part).toHaveAttribute("data-state", "live");
  await part.scrollIntoViewIfNeeded();
  await expect(part).toHaveClass(/is-revealed/);
  await expect(frame.locator("body")).toHaveAttribute("data-replay-marker", "preserved");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(part).not.toHaveClass(/is-revealed/);
  await part.scrollIntoViewIfNeeded();
  await expect(part).toHaveClass(/is-revealed/);
  await expect(frame.locator("body")).toHaveAttribute("data-replay-marker", "preserved");
});

test("transcripts cancel offscreen and retype on every entry without moving their reserved box", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/basics/features/export-connect/");
  const transcript = page.locator(".agent-transcript").first();
  await transcript.scrollIntoViewIfNeeded();
  await expect(transcript).toHaveAttribute("data-state", "running");
  const height = await transcript.evaluate((element) => element.getBoundingClientRect().height);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(transcript).toHaveAttribute("data-state", "idle");
  await expect(transcript.locator(".agent-transcript-command > code:last-child")).toHaveText("");
  await page.waitForTimeout(200);
  await expect(transcript).toHaveAttribute("data-state", "idle");
  expect(Math.abs((await transcript.evaluate((element) => element.getBoundingClientRect().height)) - height)).toBeLessThan(0.5);
  await transcript.scrollIntoViewIfNeeded();
  await expect(transcript).toHaveAttribute("data-state", "running");
  await expect(transcript).toHaveAttribute("data-state", "done", { timeout: 10000 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(transcript).toHaveAttribute("data-state", "idle");
  await transcript.scrollIntoViewIfNeeded();
  await expect(transcript).toHaveAttribute("data-state", "running");
});

test("SPA back replays feature and guide headings; 375px retains granular targets without overflow", async ({ page }) => {
  await page.goto("/basics/features/recommend/");
  await expect(page.locator(".feature-page h1")).toHaveClass(/is-revealed/);
  await page.locator(".feature-guide a").first().click();
  const h2 = page.locator(".vp-doc h2").first();
  await h2.scrollIntoViewIfNeeded();
  await expect(h2).toHaveClass(/is-revealed/);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(h2).not.toHaveClass(/is-revealed/);
  await h2.scrollIntoViewIfNeeded();
  await expect(h2).toHaveClass(/is-revealed/);
  await page.goBack();
  await page.locator(".feature-page h1").scrollIntoViewIfNeeded();
  await expect(page.locator(".feature-page h1")).toHaveClass(/is-revealed/);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/basics/");
  await expect(page.locator(".landing-chip[data-reveal]")).toHaveCount(6);
  await expect(page.locator(".landing-install-tabs button[data-reveal]")).toHaveCount(3);
  await expect(page.locator(".site-footer a[data-reveal]")).toHaveCount(7);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
});

test("desktop viewport contains at most one section's complete app parts", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/basics/");
  const result = await page.locator(".landing-hero .app-part, .landing-section .app-part").evaluateAll((elements) => {
    const boxes = elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top + scrollY,
        bottom: rect.bottom + scrollY,
        section: element.closest(".landing-section")?.querySelector("h2")?.id || "hero",
      };
    });
    const violations = [];
    for (let top = 0; top < document.body.scrollHeight; top += 20) {
      const sections = new Set(boxes.filter((box) => box.top >= top && box.bottom <= top + 900).map((box) => box.section));
      if (sections.size > 1) violations.push({ top, sections: [...sections] });
    }
    return violations;
  });
  expect(result).toEqual([]);
});
