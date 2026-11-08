import { expect, test } from "@playwright/test";

test("explore keeps filters, sort and view in the URL and clears them from the empty state", async ({ page }) => {
  await page.goto("/explore");
  // Default sort is by type, so the list is grouped under one header per type.
  await expect(page.getByRole("group", { name: /^Tech/ })).toBeVisible();

  await page.goto("/explore?type=tech&layer=testing&sort=title&view=grid");
  await expect(page.getByRole("tab", { name: "Grid", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("option")).toHaveCount(3);
  await expect(page.getByRole("group", { name: /^Tech/ })).toHaveCount(0);

  await page.getByRole("tab", { name: "List", exact: true }).click();
  await expect(page).not.toHaveURL(/view=/);

  // The type filter is a select now, so the whole toolbar fits one row at 1280px.
  await page.getByRole("button", { name: "Filter by type" }).click();
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /^Project/ })
    .click();
  await expect(page).toHaveURL(/type=project/);
  await expect(page.getByText("No notes found", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page).toHaveURL(/\/explore\?sort=title$/);
  await expect(page.getByRole("option").first()).toBeVisible();
});

test("the default list columns are title, layers, tags and updated", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto("/explore");

  const header = page.locator("[data-list-header]");
  await expect(header.getByText("Title", { exact: true })).toBeVisible();
  await expect(header.getByText("Layers", { exact: true })).toBeVisible();
  await expect(header.getByText("Tags", { exact: true })).toBeVisible();
  await expect(header.getByText("Updated", { exact: true })).toBeVisible();
  await expect(header.getByText("ID", { exact: true })).toHaveCount(0);
  // A single-source vault does not earn a Source column.
  await expect(header.locator('[data-column="source"]')).toHaveCount(0);

  // The ID left the columns but is still one hover away on the row.
  const row = page.locator("[data-note-row]").first();
  const id = await row.getAttribute("title");
  expect(id).toBeTruthy();
  await row.hover();
  await expect(row.getByText(id!, { exact: true })).toBeVisible();
});

test("the Explore toolbar keeps one row at 1280px", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto("/explore");
  await expect(page.getByRole("heading", { level: 1, name: "Explore" })).toBeVisible();

  // Every control is a direct child of the filter fieldset. Their tops must agree:
  // search, type, layer, sort, view and the action share the same row.
  const rows = await page
    .locator('[data-page-header] fieldset[aria-label="Filters"] > *')
    .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
  expect(rows.length).toBe(6);
  expect(Math.max(...rows) - Math.min(...rows)).toBeLessThan(4);

  // The action keeps its label on one line even when the row is tight. A wrapped
  // button is taller than its 32px row and reports its two lines in scrollHeight.
  const action = page.getByRole("button", { name: "New note" });
  const actionBox = await action.boundingBox();
  expect(actionBox).not.toBeNull();
  expect(Math.round(actionBox!.height)).toBe(32);
  expect(await action.evaluate((node) => node.scrollHeight <= node.clientHeight)).toBe(true);

  // The fieldset never overflows: the controls shrink and wrap instead of spilling.
  const fieldset = page.locator('[data-page-header] fieldset[aria-label="Filters"]');
  expect(await fieldset.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);

  // The search field gives way first, and the Ctrl+F chip steps aside before its text
  // can touch it: at this width the field is narrow, so the chip is hidden and the
  // placeholder still fits in the space between the icons.
  const search = page.locator('[data-page-header] input[type="search"]');
  const fits = await search.evaluate((node) => {
    const style = getComputedStyle(node);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return false;
    context.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const placeholder = context.measureText((node as HTMLInputElement).placeholder).width;
    const room = node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return room >= placeholder;
  });
  expect(fits).toBe(true);
  await expect(fieldset.locator("kbd")).toBeHidden();
});

test("explore remembers the view across navigation and hover does not scroll", async ({ page }) => {
  await page.goto("/explore");
  await page.getByRole("tab", { name: "Grid", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Grid", exact: true })).toHaveAttribute("aria-selected", "true");

  await page.getByRole("link", { name: "Home", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: "Explore", exact: true }).click();

  await expect(page.getByRole("tab", { name: "Grid", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/view=grid/);
  // Let the outgoing Home page finish leaving: returning to a route that is still
  // exiting reuses its motion wrapper and remounts the page subtree in place.
  await expect(page.getByRole("heading", { name: "Your stack memory" })).toHaveCount(0);

  const main = page.locator("main");
  const last = page.locator("[data-note-row]").last();
  await last.scrollIntoViewIfNeeded();
  const box = await last.boundingBox();
  expect(box).not.toBeNull();
  const before = await main.evaluate((element) => element.scrollTop);
  expect(before).toBeGreaterThan(0);

  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(100);
  expect(await main.evaluate((element) => element.scrollTop)).toBe(before);
});
