import { expect, test } from "@playwright/test";

// The e2e server exposes a fake Claude Code CLI (serve.mjs) that emits Claude's `stream-json`
// shape; no real agent runs. A description containing BASICS_E2E_SLEEP keeps the fake alive so
// Cancel can be exercised.

test("an agent plans the stack and its cited techs can be selected", async ({ page }) => {
  await page.goto("/recommend");
  await expect(page.getByRole("button", { name: "Backend", exact: true })).toBeVisible();

  await page.getByLabel("Describe the project", { exact: true }).fill("API REST para servir modelos de machine learning");
  await page.getByRole("button", { name: "Recommend", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Backend", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Ask an agent", exact: true }).click();
  const panel = page.getByRole("region", { name: "Ask an agent" });
  await expect(panel).toBeVisible();

  // Only the detected CLI is offered, with its model list; Claude Code defaults to `default`.
  await expect(panel.getByRole("button", { name: "Agent", exact: true })).toHaveText("Claude Code");
  await expect(panel.getByRole("button", { name: "Model", exact: true })).toHaveText("default");

  await panel.getByRole("button", { name: "Run", exact: true }).click();

  // The answer streams in as Markdown and stays when the run ends.
  await expect(panel).toContainText("Decisión: backend: fastapi");
  await expect(panel.getByRole("button", { name: /Select these/ })).toBeVisible();

  await panel.getByRole("button", { name: /Select these/ }).click();
  await expect(page.getByRole("checkbox", { name: "Select fastapi", exact: true })).toBeChecked();
});

test("a running agent can be cancelled", async ({ page }) => {
  await page.goto("/recommend");
  await expect(page.getByRole("button", { name: "Backend", exact: true })).toBeVisible();

  await page.getByLabel("Describe the project", { exact: true }).fill("BASICS_E2E_SLEEP API REST lenta");
  await page.getByRole("button", { name: "Ask an agent", exact: true }).click();
  const panel = page.getByRole("region", { name: "Ask an agent" });
  await panel.getByRole("button", { name: "Run", exact: true }).click();

  await expect(panel.getByRole("status").filter({ hasText: /Running Claude Code/ })).toBeVisible();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel.getByText("Cancelled", { exact: true })).toBeVisible();
});
