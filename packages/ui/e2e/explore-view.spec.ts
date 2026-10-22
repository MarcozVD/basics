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

  await page.getByRole("tab", { name: /^Project/ }).click();
  await expect(page).toHaveURL(/type=project/);
  await expect(page.getByText("No notes found", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Clear filters", exact: true }).click();
  await expect(page).toHaveURL(/\/explore\?sort=title$/);
  await expect(page.getByRole("option").first()).toBeVisible();
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
