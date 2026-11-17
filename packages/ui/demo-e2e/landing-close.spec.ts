import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`FAQ, install tabs and replacement footer work at ${width}px in both themes`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 });
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/basics/");
    const install = page.getByTestId("landing-install");
    for (const dark of [true, false]) {
      await page.evaluate((value) => document.documentElement.classList.toggle("dark", value), dark);
      const questions = page.locator(".landing-faq details");
      await expect(questions).toHaveCount(7);
      await expect(questions.first().locator("summary")).toHaveText("What problem does Basics solve?");
      const comparison = questions.filter({
        has: page.locator("summary", { hasText: "How is it different from Cursor rules or an AGENTS.md file?" }),
      });
      await expect(comparison.locator("a")).toHaveAttribute("href", "/basics/guide/comparison.html");
      for (const question of await questions.all()) {
        const summary = question.locator("summary");
        await summary.focus();
        await page.keyboard.press("Enter");
        await expect(question).toHaveAttribute("open", "");
        await expect(question.locator("p")).toBeVisible();
        await page.keyboard.press("Enter");
        await expect(question).not.toHaveAttribute("open");
      }
      await install.getByRole("tab", { name: "Desktop", exact: true }).click();
      await page.keyboard.press("ArrowRight");
      await expect(install.getByRole("tab", { name: "npm", exact: true })).toBeFocused();
      await expect(install.getByRole("tab", { name: "npm", exact: true })).toHaveAttribute("aria-selected", "true");
      await expect(install.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "install-tab-npm");
      await expect(install.getByRole("tabpanel").locator("code")).toHaveText("npm install -g @marcozvd/basics");
      await install.getByRole("button", { name: "Copy install command", exact: true }).click();
      await expect(install.getByRole("button", { name: "Copied", exact: true })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("npm install -g @marcozvd/basics");
      await expect(install.getByRole("status")).toHaveText("Install command copied.");
      await expect(install.getByRole("button", { name: "Copy install command", exact: true })).toBeVisible({ timeout: 3000 });
      await install.getByRole("tab", { name: "npm", exact: true }).focus();
      await page.keyboard.press("End");
      await expect(install.getByRole("tab", { name: "pnpm", exact: true })).toBeFocused();
      await expect(install.getByRole("tabpanel").locator("code")).toHaveText("pnpm add -g @marcozvd/basics");
      await install.getByRole("button", { name: "Copy install command", exact: true }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("pnpm add -g @marcozvd/basics");
      await install.getByRole("tab", { name: "pnpm", exact: true }).focus();
      await page.keyboard.press("Home");
      await expect(install.getByRole("tab", { name: "Desktop", exact: true })).toBeFocused();
      await expect(install.getByRole("status")).toBeEmpty();
      await install.getByRole("button", { name: "Copy download link", exact: true }).click();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
        new URL("/basics/guide/desktop.html#download", page.url()).href,
      );
      await expect(install.getByRole("link", { name: "All install options" })).toHaveAttribute(
        "href",
        "/basics/guide/getting-started.html#install",
      );
      const footer = page.getByRole("contentinfo", { name: "Basics footer" });
      await expect(footer.getByRole("link")).toHaveText([
        "Basics",
        "Guide",
        "Glossary",
        "Comparison",
        "Reference",
        "GitHub",
        "npm",
        "Changelog",
        "MIT",
      ]);
      await expect(footer.getByRole("link", { name: "Glossary", exact: true })).toHaveAttribute("href", "/basics/guide/glossary.html");
      await expect(footer.getByRole("link", { name: "Comparison", exact: true })).toHaveAttribute("href", "/basics/guide/comparison.html");
      await expect(page.locator(".VPFooter")).toHaveCount(0);
      await expect(page.getByText("Released under the MIT license.", { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await page.goto("/basics/guide/getting-started.html");
    await expect(page.getByRole("heading", { name: /^Getting started/, level: 1 })).toBeVisible();
    await expect(page.getByRole("contentinfo", { name: "Basics footer" })).toHaveCount(1);
    await expect(page.getByTestId("landing-install")).toHaveCount(0);
  });
}

test("landing term links resolve to real glossary anchors and comparison stays reachable", async ({ page, request }) => {
  await page.goto("/basics/");
  const glossary = await request.get("/basics/guide/glossary.html");
  expect(glossary.ok()).toBe(true);
  const html = await glossary.text();
  for (const term of ["vault", "pack", "proposal", "inbox", "check", "profile", "mcp", "skill"]) {
    await expect(page.locator(`a[href="/basics/guide/glossary.html#${term}"]`).first()).toHaveCount(1);
    expect(html).toContain(`id="${term}"`);
  }
  expect((await request.get("/basics/guide/comparison.html")).ok()).toBe(true);
  await expect(page.locator(".landing-summary")).not.toHaveAttribute("data-reveal");
});

test("copy failure selects the visible command and tells the visitor how to recover", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("Permission denied")) } });
  });
  await page.goto("/basics/");
  const install = page.getByTestId("landing-install");
  await install.getByRole("tab", { name: "npm", exact: true }).click();
  await install.getByRole("button", { name: "Copy install command", exact: true }).click();
  await expect(install.getByRole("status")).toHaveText("Copy unavailable. Select the command and copy it.");
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("npm install -g @marcozvd/basics");
  await install.getByRole("tab", { name: "pnpm", exact: true }).click();
  await expect(install.getByRole("status")).toBeEmpty();
});
