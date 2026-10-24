import { createHash } from "node:crypto";
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

/** Write an update proposal, then change the note so its recorded base hash is stale. */
function writeConflictingProposal(id: string): () => void {
  const vault = vaultPath();
  const noteFile = path.join(vault, "tech", `${id}.md`);
  const original = fs.readFileSync(noteFile, "utf8");
  const hash = createHash("sha256").update(original).digest("hex");
  const match = original.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`could not parse ${noteFile}`);
  const nl = original.includes("\r\n") ? "\r\n" : "\n";
  const proposal = [
    "proposal:",
    "  action: update",
    "  proposed_by: e2e",
    "  reason: conflict test",
    `  created: "${new Date().toISOString()}"`,
    `  base_hash: ${hash}`,
  ].join(nl);
  const inboxFile = path.join(vault, "inbox", `${id}.md`);
  fs.mkdirSync(path.dirname(inboxFile), { recursive: true });
  fs.writeFileSync(inboxFile, ["---", match[1], proposal, "---", match[2]].join(nl));
  fs.appendFileSync(noteFile, `${nl}${nl}Local edit after proposal.${nl}`);

  return () => {
    fs.rmSync(inboxFile, { force: true });
    fs.writeFileSync(noteFile, original);
  };
}

test("lists and approves a proposal from the inbox", async ({ page }) => {
  writeProposal("django", "Django", "Web framework for the e2e proposal flow.");

  await page.goto("/explore");
  await page.keyboard.press("g");
  await page.keyboard.press("i");
  await expect(page).toHaveURL(/\/inbox(\?p=.*)?$/);
  await expect(page.locator('nav a[href="/inbox"]')).toContainText("1");
  await expect(page.getByRole("button", { name: /django/i })).toBeVisible();

  // At 1280px the click selects in the master-detail pane; Enter opens the full proposal.
  await page.getByRole("button", { name: /django/i }).click();
  await expect(page).toHaveURL(/\/inbox\?p=django$/);
  await expect(page.getByText("Web framework for the e2e proposal flow.")).toBeVisible();
  await page.keyboard.press("Enter");
  // Wait for the outgoing Inbox view to finish its route transition before using the page action bar.
  // Checking the URL afterwards proves the exiting list did not write its `?p=` back onto this route.
  await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toHaveCount(0);
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

  await expect(page.getByText(/Inbox zero/)).toBeVisible();
  // The empty list drops the stale selection instead of deep-linking to a proposal that no longer exists.
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(page.getByText("Approved", { exact: true })).toBeVisible();
});

test("shows a conflict toast when approving a proposal whose note changed", async ({ page }) => {
  const restore = writeConflictingProposal("fastapi");

  try {
    await page.goto("/inbox");
    const card = page.locator('[data-proposal-id="fastapi"]');
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: /fastapi/i }).click();
    await expect(page).toHaveURL(/\/inbox\?p=fastapi$/);

    const detail = page.locator('aside[aria-label="Inbox"]');
    await detail.getByRole("button", { name: "Approve", exact: true }).click();

    await expect(page.getByText("Note changed on disk. The proposal is still pending.", { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/inbox\?p=fastapi$/);
    await expect(card).toBeVisible();
  } finally {
    restore();
  }
});

test("approves every pending proposal from the inbox header", async ({ page }) => {
  const ids = ["approve-all-one", "approve-all-two", "approve-all-three"];
  for (const [index, id] of ids.entries()) writeProposal(id, `Approve all ${index + 1}`, "Bulk approval from the inbox header.");

  try {
    await page.goto("/inbox");

    const trigger = page.getByRole("button", { name: "Approve all (3)", exact: true });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText(
      "Approve 3 proposals? Notes are written to the vault now. Proposals that conflict are kept for review.",
    );
    await dialog.getByRole("button", { name: "Approve all", exact: true }).click();

    await expect(page.getByText("Approved 3 · 0 kept for review", { exact: true })).toBeVisible();
    await expect(page.getByText(/Inbox zero/)).toBeVisible();
  } finally {
    for (const id of ids) {
      fs.rmSync(path.join(vaultPath(), "inbox", `${id}.md`), { force: true });
      fs.rmSync(path.join(vaultPath(), "tech", `${id}.md`), { force: true });
    }
  }
});

test("the inbox list does not clip its cards", async ({ page }) => {
  const ids = ["clip-one", "clip-two", "clip-three"];
  for (const [index, id] of ids.entries()) writeProposal(id, `Clip card ${index + 1}`, "Rounded card clipping check.");
  try {
    await page.setViewportSize({ width: 1440, height: 720 });
    await page.goto("/inbox");

    const list = page.getByTestId("inbox-list");
    const cards = list.locator("[data-proposal-id]");
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(ids.length);

    const inside = (index: number) =>
      list.evaluate((element, cardIndex) => {
        const container = element.getBoundingClientRect();
        const found = element.querySelectorAll("[data-proposal-id]");
        const node = found[cardIndex < 0 ? found.length - 1 : cardIndex];
        if (!node) return false;
        const card = node.getBoundingClientRect();
        // The card plus its 4px ring/outline halo must stay fully inside the scroll box.
        return (
          card.left - 4 >= container.left - 0.5 &&
          card.top - 4 >= container.top - 0.5 &&
          card.right + 4 <= container.right + 0.5 &&
          card.bottom + 4 <= container.bottom + 0.5
        );
      }, index);

    await list.evaluate((element) => {
      element.scrollTop = 0;
    });
    await expect.poll(() => inside(0)).toBe(true);

    await list.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => inside(-1)).toBe(true);
  } finally {
    for (const id of ids) fs.rmSync(path.join(vaultPath(), "inbox", `${id}.md`), { force: true });
  }
});
