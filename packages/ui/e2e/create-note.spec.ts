import { expect, test } from "@playwright/test";

test("creates a note and shows it in Explore", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "New note", exact: true }).click();
  const dialog = page.getByRole("dialog");

  await dialog.getByLabel("Type", { exact: true }).click();
  await page.getByRole("option", { name: "Tech", exact: true }).click();

  await dialog.getByLabel("ID", { exact: true }).fill("e2e-demo");

  await dialog.getByLabel("Layer", { exact: true }).click();
  await page.getByRole("option", { name: "Backend", exact: true }).click();

  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page).toHaveURL(/\/notes\/e2e-demo$/);
  await expect(page.getByRole("heading", { name: "e2e-demo", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page.getByRole("option").filter({ hasText: "e2e-demo" })).toBeVisible();
});
