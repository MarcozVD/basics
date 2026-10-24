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
