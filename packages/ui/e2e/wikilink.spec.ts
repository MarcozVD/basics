import { expect, test } from "@playwright/test";

test("opens a wikilink from the markdown preview", async ({ page }) => {
  await page.goto("/notes/fastapi");

  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await page
    .getByRole("tabpanel")
    .getByRole("button", { name: /fastapi-structure/i })
    .click();

  await expect(page).toHaveURL(/\/notes\/fastapi-structure$/);
});
