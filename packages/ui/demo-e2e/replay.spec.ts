import { expect, test } from "@playwright/test";

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
  expect(await transcript.evaluate((element) => element.getBoundingClientRect().height)).toBe(height);
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
