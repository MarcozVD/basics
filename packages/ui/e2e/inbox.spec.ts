import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { vaultPath } from "./helpers";

test("lists and approves a proposal from the inbox", async ({ page }) => {
  const vault = vaultPath();
  const inboxFile = path.join(vault, "inbox", "django.md");
  fs.rmSync(path.join(vault, "tech", "django.md"), { force: true });
  fs.mkdirSync(path.dirname(inboxFile), { recursive: true });
  fs.writeFileSync(
    inboxFile,
    [
      "---",
      "type: tech",
      "kind: framework",
      "title: Django",
      "layer: backend",
      "tags: []",
      "source: agent:e2e",
      "proposal:",
      "  action: create",
      "  proposed_by: e2e",
      "  reason: test",
      `  created: "${new Date().toISOString()}"`,
      "---",
      "# Django",
      "",
      "Web framework for the e2e proposal flow.",
      "",
    ].join("\n"),
  );

  await page.goto("/explore");
  await page.keyboard.press("g");
  await page.keyboard.press("i");
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.locator('nav a[href="/inbox"]')).toContainText("1");
  await expect(page.getByRole("button", { name: /django/i })).toBeVisible();

  await page.getByRole("button", { name: /django/i }).click();
  await expect(page).toHaveURL(/\/inbox\/django$/);
  await expect(page.getByText("New note", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/django$/);

  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(page.getByText(/Inbox is empty/)).toBeVisible();
});
