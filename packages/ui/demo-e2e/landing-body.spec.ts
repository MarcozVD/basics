import fs from "node:fs";
import { expect, test } from "@playwright/test";

const transcripts = JSON.parse(fs.readFileSync(new URL("../../../scripts/demo/transcripts.json", import.meta.url), "utf8"));
const choices = transcripts.entries.filter((entry: { kind: string }) => entry.kind === "scenario" || entry.kind === "proposal");
const content = JSON.parse(fs.readFileSync(new URL("../../../scripts/demo/generated/landing.json", import.meta.url), "utf8"));

test("six generated chips navigate matching embeds and proposal, then reset the app", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/basics/");
  const hero = page.getByTestId("landing-hero");
  const viewport = hero.locator(".landing-window-viewport");
  expect(await viewport.evaluate((element) => element.clientWidth / 1280)).toBeGreaterThanOrEqual(0.75);
  await expect(hero.getByText("Real app. Public note packs.", { exact: true })).toBeVisible();
  for (const choice of choices) {
    await hero.getByRole("button", { name: choice.label.en, exact: true }).click();
    await expect(hero.getByTestId("landing-prompts")).toHaveAttribute("data-state", "done");
    await expect(hero.locator("#hero-transcript .hero-command > code:last-child")).toHaveText(`> ${choice.command.en}`);
    await expect(hero.locator("iframe")).toHaveAttribute("src", choice.path);
    await expect(hero.getByTestId("landing-window")).toHaveAttribute("data-state", "live", { timeout: 20_000 });
    const frame = page.frameLocator('iframe[title="Interactive Basics app demo"]');
    if (choice.id === "agent-proposal")
      await expect(frame.getByRole("heading", { name: choice.answerLines.en[0].split(" (")[0], exact: true })).toBeVisible();
    else {
      await expect(frame.getByRole("heading", { name: "Recommend", exact: true })).toBeVisible();
      await expect(
        frame.getByRole("link", { name: `Open ${choice.answerLines.en[0].split(": ")[1].split(" - ")[0]}`, exact: true }),
      ).toBeVisible();
    }
  }
  await hero.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(hero.getByTestId("landing-prompts")).toHaveAttribute("data-state", "idle");
  await expect(hero.locator("iframe")).toHaveAttribute("src", "/basics/demo/explore/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
});

test("phone transcripts use generated answer lines without mounting the app", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/basics/");
  const hero = page.getByTestId("landing-hero");
  for (const choice of choices) {
    const button = hero.getByRole("button", { name: choice.label.en, exact: true });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    const answer = hero.getByTestId("recorded-answer");
    await expect(answer).toBeVisible();
    for (const line of choice.answerLines.en) await expect(answer).toContainText(line);
    await expect(hero.locator("iframe")).toHaveCount(0);
  }
  await hero.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(hero.getByTestId("recorded-answer")).toHaveCount(0);
  await expect(hero.locator('button[aria-pressed="true"]')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("typing restarts cleanly and reaches the last requested simulated answer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/basics/");
  const hero = page.getByTestId("landing-hero");
  await hero.getByRole("button", { name: "Next.js SaaS", exact: true }).click();
  await hero.locator("#hero-transcript").scrollIntoViewIfNeeded();
  await expect(hero.getByTestId("landing-prompts")).toHaveAttribute("data-state", "running");
  await hero.getByRole("button", { name: "CLI tool", exact: true }).click();
  // Clicking a chip can scroll the phone transcript out of view. Re-entry restarts it.
  await hero.locator("#hero-transcript").scrollIntoViewIfNeeded();
  await expect(hero.getByTestId("landing-prompts")).toHaveAttribute("data-state", "done", { timeout: 10000 });
  await expect(hero.locator("#hero-transcript .hero-command > code:last-child")).toHaveText('> recommend_stack "CLI tool"');
  await expect(hero.getByRole("button", { name: "CLI tool", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("README contains matching app parts and generated transcripts and a sticky linked TOC", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/basics/");
  const body = page.getByTestId("landing-readme");
  await expect(body.getByRole("heading", { level: 2 })).toHaveCount(6);
  await expect(body.getByRole("img", { name: "The Basics review loop", exact: true })).toHaveCount(1);
  await expect(body.locator('.app-part[data-part="proposal"]')).toHaveCount(1);
  await expect(body).toContainText(content.exported.tree);
  await expect(body.locator(".landing-file-preview")).toHaveAttribute("open", "");
  await expect(body).toContainText("typescript-typecheck");
  await expect(body).toContainText("npx tsc --noEmit");
  await expect(body).toContainText("--list");
  const toc = body.getByRole("navigation", { name: "On this page", exact: true });
  expect(await toc.evaluate((element) => getComputedStyle(element).position)).toBe("sticky");
  await toc.getByRole("link", { name: "Your knowledge is scattered in chats", exact: true }).click();
  await expect(page).toHaveURL(/#your-notes$/);
  await expect(page.getByRole("heading", { name: "Your knowledge is scattered in chats", exact: true })).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(toc).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
