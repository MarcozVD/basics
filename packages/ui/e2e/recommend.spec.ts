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

test("recommend keeps its state across navigation and clears it", async ({ page }) => {
  await page.goto("/recommend");
  await expect(page.getByRole("button", { name: "Backend", exact: true })).toBeVisible();

  const description = "API REST para servir modelos de machine learning";
  await page.getByLabel("Describe the project", { exact: true }).fill(description);
  await page.getByRole("button", { name: "Recommend", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Backend", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL(/\/explore/);
  await page.getByRole("link", { name: "Recommend", exact: true }).click();

  await expect(page.getByLabel("Describe the project", { exact: true })).toHaveValue(description);
  await expect(page.getByRole("heading", { name: "Backend", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByLabel("Describe the project", { exact: true })).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Backend", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear", exact: true })).toHaveCount(0);
});
