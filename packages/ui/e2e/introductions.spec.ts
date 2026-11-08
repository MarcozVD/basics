import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { vaultPath } from "./helpers";

// The owner's intro rule: a page's description sits under the title until the page has
// data or the person dismisses it; after that it lives behind the `?` in the header.
// Explore, Skills and Settings have data in this vault; Inbox starts empty, which is the
// case where the description is still on the page and can be dismissed.

const INTRO = {
  explore: "Search and filter every note in your vault, and open one to read or edit it.",
  inbox: "Agents propose notes here. Nothing enters your vault until you approve it.",
  skills: "Skills are instructions your coding agents load when a task matches them. Basics only reads them.",
  settings: "How Basics looks, which agents can read your stack, and how search works.",
} as const;

const HELP = "Help";

for (const [route, intro] of [
  ["/explore", INTRO.explore],
  ["/skills", INTRO.skills],
  ["/settings", INTRO.settings],
] as const) {
  test(`${route} keeps its intro behind the ? once it has data`, async ({ page }) => {
    await page.goto(route);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // With data the description is not under the title; the `?` holds it instead.
    await expect(page.getByText(intro, { exact: true })).toHaveCount(0);
    const help = page.getByRole("button", { name: HELP });
    await expect(help).toBeVisible();
    await help.hover();
    await expect(page.getByText(intro, { exact: true })).toBeVisible();
  });
}

function snapshotInbox(): Array<{ name: string; content: string }> {
  const dir = path.join(vaultPath(), "inbox");
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => ({ name, content: fs.readFileSync(path.join(dir, name), "utf8") }));
}

function clearInbox(): void {
  const dir = path.join(vaultPath(), "inbox");
  for (const name of fs.existsSync(dir) ? fs.readdirSync(dir).filter((entry) => entry.endsWith(".md")) : []) {
    fs.rmSync(path.join(dir, name), { force: true });
  }
}

function restoreInbox(saved: Array<{ name: string; content: string }>): void {
  const dir = path.join(vaultPath(), "inbox");
  fs.mkdirSync(dir, { recursive: true });
  for (const { name, content } of saved) fs.writeFileSync(path.join(dir, name), content);
}

test("an empty Inbox shows its intro and remembers the dismissal", async ({ page }) => {
  const saved = snapshotInbox();
  clearInbox();
  try {
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();

    // No proposals: the description is still under the title, and the empty state keeps
    // its own explanation below it. The `?` only appears once the description leaves.
    await expect(page.getByText(INTRO.inbox, { exact: true })).toBeVisible();
    await expect(page.getByText("Nothing to review yet", { exact: true })).toBeVisible();
    await expect(page.getByText("Connect an agent to start receiving proposals.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: HELP })).toHaveCount(0);

    await page.getByRole("button", { name: "Dismiss description" }).click();
    await expect(page.getByText(INTRO.inbox, { exact: true })).toHaveCount(0);
    await expect(page.getByText("Nothing to review yet", { exact: true })).toBeVisible();

    // The choice is local and survives a reload; the empty state is untouched.
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
    await expect(page.getByText(INTRO.inbox, { exact: true })).toHaveCount(0);
    await expect(page.getByText("Nothing to review yet", { exact: true })).toBeVisible();
    const help = page.getByRole("button", { name: HELP });
    await expect(help).toBeVisible();
    await help.hover();
    await expect(page.getByText(INTRO.inbox, { exact: true })).toBeVisible();
  } finally {
    restoreInbox(saved);
  }
});

test("an Inbox with a proposal moves its intro behind the ?", async ({ page }) => {
  const saved = snapshotInbox();
  clearInbox();
  fs.writeFileSync(
    path.join(vaultPath(), "inbox", "intro-proposal.md"),
    [
      "---",
      "type: layer",
      "title: Proposed layer for the intro",
      "proposal:",
      "  action: create",
      "  proposed_by: agent-e2e",
      "  reason: intro test",
      `  created: "${new Date().toISOString()}"`,
      "---",
      "# Proposed layer for the intro",
      "",
    ].join("\n"),
  );
  try {
    await page.goto("/inbox");
    await expect(page.getByRole("heading", { level: 1, name: "Inbox" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Proposed layer for the intro" })).toBeVisible();

    await expect(page.getByText(INTRO.inbox, { exact: true })).toHaveCount(0);
    const help = page.getByRole("button", { name: HELP });
    await expect(help).toBeVisible();
    await help.hover();
    await expect(page.getByText(INTRO.inbox, { exact: true })).toBeVisible();
  } finally {
    restoreInbox(saved);
  }
});
