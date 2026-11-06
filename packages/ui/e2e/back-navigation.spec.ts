import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { vaultPath } from "./helpers";

const ROWS = "[role='listbox'] [data-note-row]";

/** The editor's back control names its destination, so the label is stable. */
const BACK_TO_EXPLORE = "Back to Explore";

/** Write a pending proposal into the shared temp vault; returns a cleanup. */
function writeProposal(id: string, title: string, body: string): () => void {
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
  return () => {
    fs.rmSync(inboxFile, { force: true });
    fs.rmSync(path.join(vault, "tech", `${id}.md`), { force: true });
  };
}

// The desktop app and a browser load the same bundle: only Tauri's injected internals tell
// them apart (see lib/desktop.ts). Stub them before the page boots to exercise the app path.
async function stubDesktop(page: Page) {
  await page.addInitScript(() => {
    const scope = window as unknown as { __TAURI_INTERNALS__?: unknown };
    scope.__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" } },
      invoke: () => Promise.resolve(null),
      transformCallback: () => 1,
    };
  });
}

/**
 * A real side-button press, as Chrome delivers it. A synthetic `mouseup` misses half of the
 * input: one press fires `mouseup` and then `auxclick`, so the app must move one entry, not two.
 */
async function pressMouseButton(page: Page, button: "back" | "forward") {
  const session = await page.context().newCDPSession(page);
  // CDP button bitmask: back is 8, forward is 16.
  const buttons = button === "back" ? 8 : 16;
  const point = { x: 640, y: 300 };
  await session.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button, buttons, clickCount: 1 });
  await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button, buttons: 0, clickCount: 1 });
  await session.detach();
}

/** Open the first note from a Type-filtered Explore and wait for the editor to settle. */
async function openFirstRow(page: Page) {
  const row = page.locator(ROWS).first();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page).toHaveURL(/\/notes\//);
  await expect(page.getByRole("button", { name: BACK_TO_EXPLORE })).toBeVisible();
}

test("back from a filtered Explore note keeps its filter and its scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  await page.goto("/explore?type=tech");
  await expect(page.getByRole("tab", { name: /^Tech/ })).toHaveAttribute("aria-selected", "true");

  // Scroll to a row far enough down that the offset is real, then open a row that is already on
  // screen: clicking it must not move the scroll, so `before` is what a back has to restore.
  const main = page.locator("main");
  const row = page.locator(ROWS).nth(5);
  await row.scrollIntoViewIfNeeded();
  const before = await main.evaluate((element) => element.scrollTop);
  expect(before).toBeGreaterThan(0);

  await row.click();
  await expect(page).toHaveURL(/\/notes\//);
  await expect(page.getByRole("button", { name: BACK_TO_EXPLORE })).toBeVisible();

  await page.getByRole("button", { name: BACK_TO_EXPLORE }).click();
  await expect(page).toHaveURL(/\/explore\?type=tech$/);
  await expect(page.getByRole("tab", { name: /^Tech/ })).toHaveAttribute("aria-selected", "true");
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBe(before);
});

test("a deep link's back goes to the parent route, never out of the app", async ({ page }) => {
  await page.goto("/explore");
  await openFirstRow(page);
  const noteUrl = page.url();

  // A full reload makes this note the only in-app entry: there is nothing to pop, so the back
  // control has to fall back to the parent route.
  await page.goto(noteUrl);
  const back = page.getByRole("button", { name: BACK_TO_EXPLORE });
  await expect(back).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/explore$/);
  // Back lands on the page title, so a keyboard user keeps going from the new page.
  await expect(page.getByRole("heading", { level: 1, name: "Explore" })).toBeFocused();
});

test("Alt+Left navigates back inside the app", async ({ page }) => {
  await page.goto("/explore?type=check");
  await openFirstRow(page);

  await page.keyboard.press("Alt+ArrowLeft");
  await expect(page).toHaveURL(/\/explore\?type=check$/);
  await expect(page.getByRole("tab", { name: /^Check/ })).toHaveAttribute("aria-selected", "true");
});

test("the mouse back and forward buttons move exactly one entry each", async ({ page }) => {
  await page.goto("/");
  const sidebar = page.getByTestId("sidebar");
  for (const name of ["Explore", "Projects", "Inbox", "Skills"]) {
    await sidebar.getByRole("link", { name, exact: true }).click();
  }
  await expect(page).toHaveURL(/\/skills$/);

  // One real press must move one entry, not two: Skills -> Inbox.
  await pressMouseButton(page, "back");
  await expect(page).toHaveURL(/\/inbox$/);

  // And one real forward press returns to Skills.
  await pressMouseButton(page, "forward");
  await expect(page).toHaveURL(/\/skills$/);
});

test("Alt+Right moves forward again, still inside the app", async ({ page }) => {
  await page.goto("/explore?type=check");
  await openFirstRow(page);
  await page.getByRole("button", { name: BACK_TO_EXPLORE }).click();
  await expect(page).toHaveURL(/\/explore\?type=check$/);

  await page.keyboard.press("Alt+ArrowRight");
  await expect(page).toHaveURL(/\/notes\//);
});

test("Alt+Left stays inside the app in the desktop shell too", async ({ page }) => {
  await stubDesktop(page);
  await page.goto("/explore?type=check");
  await openFirstRow(page);

  await page.keyboard.press("Alt+ArrowLeft");
  await expect(page).toHaveURL(/\/explore\?type=check$/);
});

test("the proposal back control returns to the Inbox it came from", async ({ page }) => {
  const cleanup = writeProposal("t3-proposal-back", "T3 proposal back", "Back from the proposal route.");
  try {
    await page.goto("/inbox");
    await expect(page.getByRole("button", { name: /T3 proposal back/i })).toBeVisible();
    await page.getByRole("button", { name: /T3 proposal back/i }).click();
    await expect(page).toHaveURL(/\/inbox\?p=t3-proposal-back$/);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/inbox\/t3-proposal-back$/);

    const back = page.getByRole("button", { name: "Back to Inbox" });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/inbox(\?p=t3-proposal-back)?$/);
  } finally {
    cleanup();
  }
});

test("a deep link to a proposal falls back to the Inbox", async ({ page }) => {
  const cleanup = writeProposal("t3-proposal-deep", "T3 proposal deep", "Deep link fallback.");
  try {
    // A full reload makes this the only in-app entry: there is nothing to pop.
    await page.goto("/inbox/t3-proposal-deep");
    const back = page.getByRole("button", { name: "Back to Inbox" });
    await expect(back).toBeVisible();
    await back.click();
    await expect(page).toHaveURL(/\/inbox$/);
  } finally {
    cleanup();
  }
});
