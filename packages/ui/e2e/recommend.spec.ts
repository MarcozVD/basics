import { expect, test } from "@playwright/test";

test("recommends fastapi and generates STACK.md", async ({ page }) => {
  await page.goto("/recommend");

  await page.getByLabel("Describe the project", { exact: true }).fill("API REST para servir modelos de machine learning");
  await page.getByRole("button", { name: "Recommend", exact: true }).click();

  const backend = page.getByRole("heading", { name: "Backend", exact: true });
  await expect(backend).toBeVisible();
  await expect(backend.locator("..").getByRole("link").first()).toHaveText("fastapi");

  await page.getByRole("checkbox", { name: "Select fastapi", exact: true }).check();
  await page.getByRole("button", { name: "Generate STACK.md", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("FastAPI");
});
