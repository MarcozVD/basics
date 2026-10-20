import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { vaultPath } from "./helpers";

function writeProposal(id: string, title: string, body: string) {
  const vault = vaultPath();
  const inboxFile = path.join(vault, "inbox", `${id}.md`);
  fs.rmSync(path.join(vault, "tech", `${id}.md`), { force: true });
  fs.mkdirSync(path.dirname(inboxFile), { recursive: true });
  fs.writeFileSync(
    inboxFile,
    [
      "---",
      "type: tech",
      "kind: framework",
      `title: ${title}`,
      "layer: backend",
      "tags: []",
      "source: agent:e2e",
      "proposal:",
      "  action: create",
      "  proposed_by: e2e",
      "  reason: test",
      `  created: "${new Date().toISOString()}"`,
      "---",
      `# ${title}`,
      "",
      body,
      "",
    ].join("\n"),
  );
}

test("lists and approves a proposal from the inbox", async ({ page }) => {
  writeProposal("django", "Django", "Web framework for the e2e proposal flow.");

  await page.goto("/explore");
  await page.keyboard.press("g");
  await page.keyboard.press("i");
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.locator('nav a[href="/inbox"]')).toContainText("1");
  await expect(page.getByRole("button", { name: /django/i })).toBeVisible();

  await page.getByRole("button", { name: /django/i }).click();
  await expect(page).toHaveURL(/\/inbox\/django$/);
  await expect(page.getByText("Web framework for the e2e proposal flow.")).toBeVisible();

  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/django$/);

  await page.locator('nav a[href="/inbox"]').click();
  await expect(page.getByText(/Inbox zero/)).toBeVisible();
});

test("approves a proposal directly from the list card", async ({ page }) => {
  writeProposal("svelte", "Svelte", "Compiler-first UI framework for the list approval flow.");

  await page.goto("/inbox");
  await expect(page.getByRole("button", { name: /svelte/i })).toBeVisible();

  await page.locator('[data-proposal-id="svelte"]').getByRole("button", { name: "Approve", exact: true }).click();

  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByText(/Inbox zero/)).toBeVisible();
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
});
