import { expect, type Page, test } from "@playwright/test";

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

/** Dispatches a keydown on `target` and reports whether the app cancelled it. */
async function keyCancelled(page: Page, init: KeyboardEventInit, selector = "body"): Promise<boolean> {
  return page.evaluate(
    ({ init, selector }) => {
      const target = document.querySelector(selector) ?? document.body;
      const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    },
    { init, selector },
  );
}

test("the desktop app owns its shortcuts: Ctrl+F searches, browser actions are swallowed", async ({ page }) => {
  await stubDesktop(page);
  await page.goto("/");

  // Desktop detected: the title strip renders the window buttons a browser never has.
  await expect(page.getByTestId("window-controls")).toBeVisible();

  // Ctrl+K opens the palette with a query, Ctrl+F clears it and takes the caret: the app's
  // own search instead of the browser's find bar.
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();
  const search = page.getByRole("combobox");
  await search.fill("fast");
  await expect(search).toHaveValue("fast");

  await page.keyboard.press("Control+f");
  await expect(dialog).toBeVisible();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await page.keyboard.press("Escape");

  // Print, reload, source, find-again and zoom never reach the page.
  expect(await keyCancelled(page, { key: "p", ctrlKey: true })).toBe(true);
  expect(await keyCancelled(page, { key: "r", ctrlKey: true })).toBe(true);
  expect(await keyCancelled(page, { key: "u", ctrlKey: true })).toBe(true);
  expect(await keyCancelled(page, { key: "F5" })).toBe(true);
  expect(await keyCancelled(page, { key: "F3" })).toBe(true);
  expect(await keyCancelled(page, { key: "=", ctrlKey: true })).toBe(true);
  expect(await keyCancelled(page, { key: "ArrowLeft", altKey: true })).toBe(true);

  // Text keys and typing stay exactly as they are.
  expect(await keyCancelled(page, { key: "c", ctrlKey: true })).toBe(false);
  expect(await keyCancelled(page, { key: "v", ctrlKey: true })).toBe(false);
  expect(await keyCancelled(page, { key: "a", ctrlKey: true })).toBe(false);
  expect(await keyCancelled(page, { key: "p" })).toBe(false);

  // Ctrl+wheel cannot zoom the window either.
  const zoom = await page.evaluate(() => {
    const event = new WheelEvent("wheel", { deltaY: 120, ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(zoom).toBe(true);
});

test("the desktop app drops the native context menu except in fields that need it", async ({ page }) => {
  await stubDesktop(page);
  await page.goto("/");
  await expect(page.getByTestId("window-controls")).toBeVisible();

  const blocked = await page.evaluate(() => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.querySelector("main")?.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(blocked).toBe(true);

  // A field keeps cut/copy/paste and spelling: open the palette and right-click its input.
  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox");
  await expect(search).toBeVisible();
  const allowed = await page.evaluate(() => {
    const input = document.querySelector('[role="combobox"]') ?? document.body;
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(allowed).toBe(false);
});
