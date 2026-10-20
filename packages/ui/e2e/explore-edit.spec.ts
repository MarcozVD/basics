import { expect, test } from "@playwright/test";

test("filters by layer, edits a note title and persists it", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: /^Testing\b/ }).click();
  await expect(page.getByRole("option")).toHaveCount(3);

  await page
    .getByRole("option")
    .filter({ hasText: /vitest/i })
    .click();
  await expect(page).toHaveURL(/\/notes\/vitest$/);

  const title = page.getByLabel("Title", { exact: true });
  await expect(title).toHaveValue("Vitest");
  await title.fill("Vitest E2E");

  await page.keyboard.press("Control+s");
  await expect(page.getByText("Note saved", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Vitest E2E");
});
