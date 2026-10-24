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

/** Seed the vault's activity log; returns a restore function for the previous file. */
function seedActivity(count: number): () => void {
  const dir = path.join(vaultPath(), ".basics");
  const file = path.join(dir, "activity.jsonl");
  fs.mkdirSync(dir, { recursive: true });
  const previous = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const now = Date.now();
  const lines = Array.from({ length: count }, (_, index) =>
    JSON.stringify({
      // Alternating agents keep every event its own row instead of collapsing into groups.
      ts: new Date(now - index * 60_000).toISOString(),
      agent: index % 2 === 0 ? "claude-code" : "opencode",
      tool: "get_note",
      noteIds: ["fastapi"],
    }),
  );
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
  return () => {
    if (previous === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, previous);
  };
}

test("activity panel scrolls on its own instead of growing the page", async ({ page }) => {
  const restore = seedActivity(60);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const panel = page.getByTestId("activity-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("tabindex", "0");

    const metrics = await page.evaluate(() => {
      const activity = document.querySelector<HTMLElement>('[data-testid="activity-panel"]');
      const main = document.querySelector<HTMLElement>("main");
      return {
        viewport: window.innerHeight,
        documentHeight: document.scrollingElement?.scrollHeight ?? 0,
        panelScrollHeight: activity?.scrollHeight ?? 0,
        panelClientHeight: activity?.clientHeight ?? 0,
        mainScrollHeight: main?.scrollHeight ?? 0,
        mainClientHeight: main?.clientHeight ?? 0,
      };
    });

    // The document never scrolls, and neither does <main>: the panel took the remaining space.
    expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.mainScrollHeight).toBeLessThanOrEqual(metrics.mainClientHeight + 1);
    expect(metrics.panelScrollHeight).toBeGreaterThan(metrics.panelClientHeight);

    // The bottom fade appears only once the list extends past the panel.
    const mask = await panel.evaluate((element) => getComputedStyle(element).maskImage);
    expect(mask).not.toBe("none");

    // The panel is focusable and scrolls with the keyboard.
    await panel.focus();
    await page.keyboard.press("End");
    await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  } finally {
    restore();
  }
});
