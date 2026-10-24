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

test("home shows the agent loop and approves from the queue", async ({ page }) => {
  // create-note.spec runs before this file and leaves tech notes behind.
  for (const id of ["drizzle-orm", "hono"]) {
    fs.rmSync(path.join(vaultPath(), "tech", `${id}.md`), { force: true });
  }

  await page.goto("/");

  const techTile = page.locator('[data-stat="tech"]');
  await expect(techTile).toContainText("Tech");
  await expect(techTile).toContainText("9");

  writeProposal("homeflow", "Home flow", "Proposal approved from the Home screen.");

  await expect(page.getByRole("button", { name: /homeflow/i })).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();

  await expect(page.getByText("Nothing to review", { exact: true })).toBeVisible();
});

test("creates the missing note from the broken links tile", async ({ page }) => {
  const file = path.join(vaultPath(), "tech", "broken-source.md");
  fs.writeFileSync(
    file,
    [
      "---",
      "type: tech",
      "kind: library",
      "title: Broken source",
      "layer: backend",
      "---",
      "# Broken source",
      "",
      "Depends on [[ghost-tech]].",
      "",
    ].join("\n"),
  );
  try {
    await page.goto("/");
    // Other specs may leave broken links behind; only this one matters here.
    const tile = page.getByRole("button", { name: /^Broken links: \d+ — Show details$/ });
    await tile.click();

    const row = page.locator('[data-broken-link="ghost-tech"]');
    await expect(row).toContainText("broken-source");
    await row.getByRole("button", { name: "Create note ghost-tech" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("ID", { exact: true })).toHaveValue("ghost-tech");
    await page.keyboard.press("Escape");

    await tile.click();
    await row.getByRole("button", { name: /^Open broken-source/ }).click();
    await expect(page).toHaveURL(/\/notes\/broken-source$/);
  } finally {
    fs.rmSync(file, { force: true });
  }
});
