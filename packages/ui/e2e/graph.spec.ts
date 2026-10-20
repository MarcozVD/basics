import { expect, test } from "@playwright/test";

test("graph renders, search + Enter selects a node and the drawer opens its note", async ({ page }) => {
  await page.goto("/graph");

  const canvas = page.getByTestId("graph-canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas.locator("canvas").first()).toBeVisible();
  await expect(page.getByTestId("graph-toolbar")).toBeVisible();

  await page.getByTestId("graph-search").fill("fastapi");
  await page.getByTestId("graph-search").press("Enter");

  const drawer = page.getByRole("dialog", { name: "Note details" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "FastAPI" })).toBeVisible();

  await page.getByTestId("graph-open-note").click();
  await expect(page).toHaveURL(/\/notes\/fastapi$/);
});
