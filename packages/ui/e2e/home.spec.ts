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
  // create-note.spec runs before this file and leaves a tech note behind.
  fs.rmSync(path.join(vaultPath(), "tech", "e2e-demo.md"), { force: true });

  await page.goto("/");

  const techTile = page.locator('[data-stat="tech"]');
  await expect(techTile).toContainText("Tech");
  await expect(techTile).toContainText("9");

  writeProposal("homeflow", "Home flow", "Proposal approved from the Home screen.");

  await expect(page.getByRole("button", { name: /homeflow/i })).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();

  await expect(page.getByText("Nothing to review", { exact: true })).toBeVisible();
});
