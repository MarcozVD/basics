import { expect, test } from "@playwright/test";

test("opens the palette with Ctrl+K and jumps to a note", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Control+k");

  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();

  await page.getByRole("combobox").fill("fast");
  await expect(dialog.getByRole("option").first()).toContainText("FastAPI");

  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/notes\/fastapi$/);
});
