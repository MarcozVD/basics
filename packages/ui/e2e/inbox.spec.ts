import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { vaultPath } from "./helpers";

function writeProposal(id: string, title: string, body: string, created = new Date().toISOString(), agent = "e2e") {
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
      `  proposed_by: ${agent}`,
      "  reason: test",
      `  created: "${created}"`,
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
  // The decision is queued: the next proposal opens at once and the toast can undo it.
  await expect(page).toHaveURL(/\/inbox(\?p=django)?$/);
  await expect(page.getByText("Approved Django", { exact: true })).toBeVisible();
  await expect(page.getByText("Saving in 6 s", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Undo (Z)", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open note", exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Open note", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/django$/);

  await page.locator('nav a[href="/inbox"]').click();
  await expect(page.getByText(/Nothing to review yet/)).toBeVisible();
  // With nothing pending the whole content area holds one empty state: no list and no detail pane.
  await expect(page.getByTestId("inbox-list")).toHaveCount(0);
  await expect(page.locator("main aside")).toHaveCount(0);
});

test("approves a proposal from the detail panel instead of the list", async ({ page }) => {
  writeProposal("svelte", "Svelte", "Compiler-first UI framework for the detail approval flow.");

  await page.goto("/inbox");
  const card = page.locator('[data-proposal-id="svelte"]');
  await expect(page.getByRole("button", { name: /svelte/i })).toBeVisible();
  // The row carries no actions of its own; selecting it fills the detail panel where they live.
  await expect(card.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: /svelte/i }).click();
  await expect(page).toHaveURL(/\/inbox\?p=svelte$/);
  const detail = page.locator('aside[aria-label="Inbox"]');
  await expect(detail).toContainText("Compiler-first UI framework for the detail approval flow.");
  await detail.getByRole("button", { name: "Approve", exact: true }).click();

  await expect(page.getByText("Approved Svelte", { exact: true })).toBeVisible();
  await expect(page.getByText(/Nothing to review yet/)).toBeVisible({ timeout: 10_000 });
  // The empty list drops the stale selection instead of deep-linking to a proposal that no longer exists.
  await expect(page).toHaveURL(/\/inbox$/);
});

test("a narrow inbox keeps the actions on the proposal page", async ({ page }) => {
  writeProposal("narrow", "Narrow proposal", "Actions belong to the proposal page on a phone.");

  try {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/inbox");

    const card = page.locator('[data-proposal-id="narrow"]');
    await expect(card).toBeVisible();
    // The narrow list keeps its rows to kind, title, author and age.
    await expect(card.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);

    await card.getByRole("button", { name: /Narrow proposal/ }).click();
    await expect(page).toHaveURL(/\/inbox\/narrow$/);
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
  } finally {
    fs.rmSync(path.join(vaultPath(), "inbox", "narrow.md"), { force: true });
  }
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

    await expect(page.getByText("Note changed on disk. The proposal is still pending.", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
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
      "Approve 3 proposals? Notes are written to the vault in 6 seconds; you can undo from the toast. Proposals that conflict are kept for review.",
    );
    await dialog.getByRole("button", { name: "Approve all", exact: true }).click();

    await expect(page.getByText("Approved 3 notes", { exact: true })).toBeVisible();
    await expect(page.getByText("Saving in 6 s", { exact: true })).toBeVisible();
    await expect(page.getByText("Approved 3 · 0 kept for review", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Nothing to review yet/)).toBeVisible();
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

test("rejects every pending proposal from the inbox header", async ({ page }) => {
  const ids = ["reject-all-one", "reject-all-two", "reject-all-three"];
  for (const [index, id] of ids.entries()) writeProposal(id, `Reject all ${index + 1}`, "Bulk rejection from the inbox header.");

  try {
    await page.goto("/inbox");

    const trigger = page.getByRole("button", { name: "Reject all (3)", exact: true });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Reject 3 proposals? They are deleted from the inbox in 6 seconds; you can undo from the toast.");
    await dialog.getByRole("button", { name: "Reject all", exact: true }).click();

    await expect(page.getByText("Rejected 3 notes", { exact: true })).toBeVisible();
    await expect(page.getByText("Rejected 3 · 0 kept", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Nothing to review yet/)).toBeVisible();
  } finally {
    for (const id of ids) fs.rmSync(path.join(vaultPath(), "inbox", `${id}.md`), { force: true });
  }
});

test("rejects a selection of proposals with the card checkboxes", async ({ page }) => {
  const ids = ["reject-sel-one", "reject-sel-two", "reject-sel-three"];
  for (const [index, id] of ids.entries()) writeProposal(id, `Reject sel ${index + 1}`, "Selection rejection check.");

  try {
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.goto("/inbox");

    await page.getByRole("checkbox", { name: "Select Reject sel 1", exact: true }).check();
    await page.getByRole("checkbox", { name: "Select Reject sel 2", exact: true }).check();

    // The selection bar replaces the header actions with a live count.
    await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reject selected", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Reject 2 proposals? They are deleted from the inbox in 6 seconds; you can undo from the toast.");
    await dialog.getByRole("button", { name: "Reject selected", exact: true }).click();

    await expect(page.getByText("Rejected 2 notes", { exact: true })).toBeVisible();
    await expect(page.getByText("Rejected 2 · 0 kept", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-proposal-id="reject-sel-three"]')).toBeVisible();
    await expect(page.locator("[data-proposal-id]")).toHaveCount(1);
  } finally {
    for (const id of ids) fs.rmSync(path.join(vaultPath(), "inbox", `${id}.md`), { force: true });
  }
});

test("undo restores an approval before it is written", async ({ page }) => {
  writeProposal("undo-approve", "Undo approve", "Approval cancelled inside the undo window.");

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/inbox");
    await page.getByRole("button", { name: /Undo approve/i }).click();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/inbox\/undo-approve$/);
    await expect(page.getByRole("heading", { name: "Inbox", level: 1 })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();

    await page.keyboard.press("a");
    await expect(page).toHaveURL(/\/inbox(\?p=undo-approve)?$/);
    await expect(page.getByText("Approved Undo approve", { exact: true })).toBeVisible();
    await expect(page.getByText("Saving in 6 s", { exact: true })).toBeVisible();

    await page.keyboard.press("z");
    await expect(page).toHaveURL(/\/inbox\/undo-approve$/);
    await expect(page.getByText("Saving in 6 s", { exact: true })).toHaveCount(0);

    // Give the cancelled timer more than its full window: nothing may reach the vault.
    await page.waitForTimeout(6500);
    expect(fs.existsSync(path.join(vaultPath(), "tech", "undo-approve.md"))).toBe(false);
    expect(fs.existsSync(path.join(vaultPath(), "inbox", "undo-approve.md"))).toBe(true);
  } finally {
    fs.rmSync(path.join(vaultPath(), "inbox", "undo-approve.md"), { force: true });
    fs.rmSync(path.join(vaultPath(), "tech", "undo-approve.md"), { force: true });
  }
});

test("approve writes the note after the undo window", async ({ page }) => {
  writeProposal("undo-write", "Undo write", "Approval committed when the window closes.");

  try {
    await page.goto("/inbox/undo-write");
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(page.getByText("Approved Undo write", { exact: true })).toBeVisible();
    await expect(page.getByText("Saving in 6 s", { exact: true })).toBeVisible();

    await expect(page.getByRole("button", { name: "Open note", exact: true })).toBeVisible({ timeout: 10_000 });
    expect(fs.existsSync(path.join(vaultPath(), "tech", "undo-write.md"))).toBe(true);

    await page.getByRole("button", { name: "Open note", exact: true }).click();
    await expect(page).toHaveURL(/\/notes\/undo-write$/);
  } finally {
    fs.rmSync(path.join(vaultPath(), "inbox", "undo-write.md"), { force: true });
    fs.rmSync(path.join(vaultPath(), "tech", "undo-write.md"), { force: true });
  }
});

test("undo restores a rejection after its confirm", async ({ page }) => {
  writeProposal("undo-reject", "Undo reject", "Rejection cancelled inside the undo window.");

  try {
    await page.goto("/inbox/undo-reject");
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
    await page.keyboard.press("r");
    const live = page.getByRole("status").filter({ hasText: "Confirm reject?" });
    await expect(live).toContainText("Confirm reject? Press R again to delete this proposal.");

    await page.keyboard.press("r");
    await expect(page).toHaveURL(/\/inbox(\?p=undo-reject)?$/);
    await expect(page.getByText("Rejected Undo reject", { exact: true })).toBeVisible();
    await expect(page.getByText("Saving in 6 s", { exact: true })).toBeVisible();

    await page.keyboard.press("z");
    await expect(page).toHaveURL(/\/inbox\/undo-reject$/);
    await page.waitForTimeout(6500);
    expect(fs.existsSync(path.join(vaultPath(), "inbox", "undo-reject.md"))).toBe(true);
    expect(fs.existsSync(path.join(vaultPath(), "tech", "undo-reject.md"))).toBe(false);
  } finally {
    fs.rmSync(path.join(vaultPath(), "inbox", "undo-reject.md"), { force: true });
    fs.rmSync(path.join(vaultPath(), "tech", "undo-reject.md"), { force: true });
  }
});

test("a queued edit with an invalid field reopens the editor with the draft", async ({ page }) => {
  writeProposal("recover-edit", "Recover edit", "Original body that will be replaced.");

  await page.route("**/api/inbox/recover-edit/approve", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "invalid",
        message: "invalid note",
        issues: [{ path: ["body"], message: "Body must be a non-empty string." }],
      }),
    }),
  );

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/inbox");
    await page.getByRole("button", { name: /Recover edit/i }).click();

    const detail = page.locator('aside[aria-label="Inbox"]');
    await detail.getByRole("button", { name: "Edit & approve" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#proposal-body").fill("Edited body that must survive.");
    await dialog.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Saving in 6 s", { exact: true })).toBeVisible();

    // Still inside the Inbox when the 400 arrives: open the proposal and restore the draft.
    await expect(page).toHaveURL(/\/inbox\/recover-edit$/, { timeout: 10_000 });
    const reopened = page.getByRole("dialog");
    await expect(reopened).toBeVisible();
    await expect(reopened.locator("#proposal-body")).toHaveValue("Edited body that must survive.");
    await expect(reopened.getByText("Body must be a non-empty string.", { exact: true })).toBeVisible();
    await expect(page.getByText("The proposal has invalid fields. Review it and try again.", { exact: true })).toHaveCount(0);
    expect(fs.existsSync(path.join(vaultPath(), "inbox", "recover-edit.md"))).toBe(true);
  } finally {
    fs.rmSync(path.join(vaultPath(), "inbox", "recover-edit.md"), { force: true });
    fs.rmSync(path.join(vaultPath(), "tech", "recover-edit.md"), { force: true });
  }
});

test("a failed queued edit offers Open from another route and restores the draft there", async ({ page }) => {
  writeProposal("recover-away", "Recover away", "Original body before the edit.");

  await page.route("**/api/inbox/recover-away/approve", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "invalid",
        message: "invalid note",
        issues: [{ path: ["body"], message: "Body must be a non-empty string." }],
      }),
    }),
  );

  try {
    await page.goto("/inbox/recover-away");
    await page.getByRole("button", { name: "Edit & approve" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("#proposal-body").fill("Edited away from the review loop.");
    await dialog.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(dialog).toBeHidden();

    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);

    await expect(page.getByText("The proposal has invalid fields. Review it and try again.", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByRole("button", { name: "Open", exact: true }).click();

    await expect(page).toHaveURL(/\/inbox\/recover-away$/);
    const reopened = page.getByRole("dialog");
    await expect(reopened).toBeVisible();
    await expect(reopened.locator("#proposal-body")).toHaveValue("Edited away from the review loop.");
    await expect(reopened.getByText("Body must be a non-empty string.", { exact: true })).toBeVisible();
    expect(fs.existsSync(path.join(vaultPath(), "inbox", "recover-away.md"))).toBe(true);
  } finally {
    fs.rmSync(path.join(vaultPath(), "inbox", "recover-away.md"), { force: true });
    fs.rmSync(path.join(vaultPath(), "tech", "recover-away.md"), { force: true });
  }
});

test("review toasts stay clear of the proposal action bar at every viewport", async ({ page }) => {
  writeProposal("toast-next", "Toast next", "Second proposal, so approving keeps an action bar on screen.");
  writeProposal("toast-clear", "Toast clear", "Bounding boxes for the action bar.");

  const sizes = [
    { width: 1440, height: 900 },
    { width: 1280, height: 820 },
    { width: 1024, height: 768 },
  ];

  const measure = async (label: string) => {
    const toast = page.locator('ol[aria-live="polite"] li').first();
    const bar = page.getByRole("toolbar", { name: "Proposal actions" }).first();
    await expect(toast).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Proposal actions" })).toHaveCount(1);
    await page.waitForTimeout(350);
    const toastBox = await toast.boundingBox();
    const barBox = await bar.boundingBox();
    if (!toastBox || !barBox) throw new Error(`missing boxes at ${label}`);
    const overlaps =
      toastBox.x < barBox.x + barBox.width &&
      toastBox.x + toastBox.width > barBox.x &&
      toastBox.y < barBox.y + barBox.height &&
      toastBox.y + toastBox.height > barBox.y;
    // Print the measured boxes so the report can quote them without screenshots.
    console.log(
      `[toast] ${label} toast=${Math.round(toastBox.x)},${Math.round(toastBox.y)} ${Math.round(toastBox.width)}x${Math.round(
        toastBox.height,
      )} bar=${Math.round(barBox.x)},${Math.round(barBox.y)} ${Math.round(barBox.width)}x${Math.round(barBox.height)}`,
    );
    expect(overlaps, `toast overlaps the action bar at ${label}`).toBe(false);
  };

  const runAtSize = async (mode: string, size: { width: number; height: number }) => {
    await page.setViewportSize(size);
    await page.goto("/inbox/toast-clear");
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeVisible();
    await page.keyboard.press("a");
    await expect(page).toHaveURL(/\/inbox\/toast-next$/);
    await measure(`${mode} ${size.width}x${size.height}`);
    await page.keyboard.press("z");
    await expect(page).toHaveURL(/\/inbox\/toast-clear$/);
  };

  try {
    for (const size of sizes) await runAtSize("sidebar", size);

    await page.goto("/settings");
    await page.getByText("Floating", { exact: true }).click();
    await expect(page.getByTestId("floating-nav")).toBeVisible();

    for (const size of sizes) await runAtSize("floating", size);
  } finally {
    for (const id of ["toast-clear", "toast-next"]) {
      fs.rmSync(path.join(vaultPath(), "inbox", `${id}.md`), { force: true });
      fs.rmSync(path.join(vaultPath(), "tech", `${id}.md`), { force: true });
    }
  }
});

test("selects with x and approves the selection", async ({ page }) => {
  const ids = ["pick-x-one", "pick-x-two"];
  for (const [index, id] of ids.entries()) writeProposal(id, `Pick x ${index + 1}`, "Keyboard selection check.");

  try {
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.goto("/inbox");

    await expect(page.getByRole("button", { name: /Pick x 1/i })).toBeVisible();
    // The card body focuses the list, then `x` toggles its checkbox.
    await page.getByRole("button", { name: /Pick x 1/i }).click();
    await page.keyboard.press("x");
    await expect(page.getByText("1 selected", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Approve selected", exact: true }).click();
    await expect(page.getByText("Approved 1 note", { exact: true })).toBeVisible();
    await expect(page.getByText("Approved 1 · 0 kept for review", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("[data-proposal-id]")).toHaveCount(1);
  } finally {
    for (const id of ids) {
      fs.rmSync(path.join(vaultPath(), "inbox", `${id}.md`), { force: true });
      fs.rmSync(path.join(vaultPath(), "tech", `${id}.md`), { force: true });
    }
  }
});

test("filters pending proposals by agent and scopes approve all to that agent", async ({ page }) => {
  const mine = ["agent-a-one", "agent-a-two"];
  const other = "agent-b-one";
  writeProposal(mine[0], "Agent A one", "First from agent A.", new Date().toISOString(), "agent-a");
  writeProposal(mine[1], "Agent A two", "Second from agent A.", new Date().toISOString(), "agent-a");
  writeProposal(other, "Agent B one", "Only from agent B.", new Date().toISOString(), "agent-b");

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/inbox");

    // With two proposers the agent select appears beside the action tabs.
    const filter = page.getByRole("button", { name: "Filter by agent", exact: true });
    await expect(filter).toBeVisible();
    await filter.click();
    await page.getByRole("option", { name: "agent-a", exact: true }).click();

    await expect(page.locator("[data-proposal-id]")).toHaveCount(2);
    const trigger = page.getByRole("button", { name: "Approve 2 from agent-a", exact: true });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Approve 2 proposals?");
    await dialog.getByRole("button", { name: "Approve all", exact: true }).click();

    await expect(page.getByText("Approved 2 notes", { exact: true })).toBeVisible();
    await expect(page.getByText("Approved 2 · 0 kept for review", { exact: true })).toBeVisible({ timeout: 10_000 });

    // The other agent was outside the scope and is still pending.
    await expect(page.locator(`[data-proposal-id="${other}"]`)).toBeVisible();
    await expect(page.locator("[data-proposal-id]")).toHaveCount(1);
  } finally {
    for (const id of [...mine, other]) {
      fs.rmSync(path.join(vaultPath(), "inbox", `${id}.md`), { force: true });
      fs.rmSync(path.join(vaultPath(), "tech", `${id}.md`), { force: true });
    }
  }
});

test("bulk actions keep their place and disable at one pending", async ({ page }) => {
  writeProposal("bulk-one", "Bulk one", "One pending proposal.", new Date().toISOString(), "agent-a");

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/inbox");

    const approve = page.getByRole("button", { name: "Approve all (1)", exact: true });
    const reject = page.getByRole("button", { name: "Reject all (1)", exact: true });
    await expect(approve).toBeVisible();
    await expect(approve).toBeDisabled();
    await expect(reject).toBeVisible();
    await expect(reject).toBeDisabled();

    const tabs = page.getByRole("tablist");
    const before = await tabs.boundingBox();
    expect(before).not.toBeNull();

    // A second proposal enables the same buttons without moving the tabs.
    writeProposal("bulk-two", "Bulk two", "Second pending proposal.", new Date().toISOString(), "agent-a");
    await page.reload();
    await expect(page.getByRole("button", { name: "Approve all (2)", exact: true })).toBeEnabled();
    const after = await tabs.boundingBox();
    expect(after).not.toBeNull();
    if (!before || !after) return;
    expect(Math.abs(after.x - before.x)).toBeLessThan(1);
  } finally {
    for (const id of ["bulk-one", "bulk-two"]) {
      fs.rmSync(path.join(vaultPath(), "inbox", `${id}.md`), { force: true });
      fs.rmSync(path.join(vaultPath(), "tech", `${id}.md`), { force: true });
    }
  }
});

test("the palette leads with the next proposal and the inbox focuses its selected row", async ({ page }) => {
  writeProposal("focus-one", "Focus one", "Older focus row.", new Date(Date.now() - 60_000).toISOString(), "agent-a");
  writeProposal("focus-two", "Focus two", "Newer focus row.", new Date().toISOString(), "agent-a");

  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/inbox");

    // Newest first is the default selection, and it receives focus on load.
    await expect(page.locator('[data-proposal-id="focus-two"] [data-proposal-open]')).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.locator('[data-proposal-id="focus-one"] [data-proposal-open]')).toBeFocused();
    await expect(page).toHaveURL(/\/inbox\?p=focus-one$/);

    await page.keyboard.press("Control+k");
    await expect(page.getByRole("option").first()).toContainText("Review next proposal (2)");
    await page.keyboard.press("Escape");
  } finally {
    for (const id of ["focus-one", "focus-two"]) {
      fs.rmSync(path.join(vaultPath(), "inbox", `${id}.md`), { force: true });
      fs.rmSync(path.join(vaultPath(), "tech", `${id}.md`), { force: true });
    }
  }
});
