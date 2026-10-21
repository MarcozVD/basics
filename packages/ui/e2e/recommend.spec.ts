import { expect, test } from "@playwright/test";

test("recommends fastapi and exports the project files", async ({ page }) => {
  await page.goto("/recommend");
  // The layer filter only renders once /api/layers resolves; submit needs those ids.
  await expect(page.getByRole("button", { name: "Backend", exact: true })).toBeVisible();

  await page.getByLabel("Describe the project", { exact: true }).fill("API REST para servir modelos de machine learning");
  await page.getByRole("button", { name: "Recommend", exact: true }).click();

  const backend = page.getByRole("heading", { name: "Backend", exact: true });
  await expect(backend).toBeVisible();
  await expect(backend.locator("..").getByRole("link").first()).toHaveText("fastapi");

  await page.getByRole("checkbox", { name: "Select fastapi", exact: true }).check();
  await page.getByRole("button", { name: "Export stack", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Export", exact: true })).toBeVisible();
  await expect(dialog).toContainText("FastAPI");
  await expect(dialog).toContainText("basics export --stack fastapi");

  await dialog.getByRole("tab", { name: "AGENTS.md", exact: true }).click();
  await expect(dialog).toContainText("<!-- basics:start -->");

  await dialog.getByRole("tab", { name: "Cursor", exact: true }).click();
  await expect(dialog).toContainText("alwaysApply: true");
});
