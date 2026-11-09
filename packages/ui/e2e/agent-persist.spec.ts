import { expect, type Page, test } from "@playwright/test";
import { openRecommendLayers } from "./helpers";

// The e2e server exposes a fake Claude Code CLI (serve.mjs) that emits Claude's `stream-json`
// shape. A description containing BASICS_E2E_SLOW makes it answer after a short delay, so a run
// can be started, left, and finished while the user is on another page; BASICS_E2E_SLEEP keeps it
// running so a reload can interrupt it.

const ANSWER = "Decisión: backend: fastapi";

async function openPanel(page: Page) {
  await page.getByRole("button", { name: "Ask an agent", exact: true }).click();
  const panel = page.getByRole("region", { name: "Ask an agent" });
  await expect(panel).toBeVisible();
  return panel;
}

/** Wait until the running run (and its id) reached sessionStorage, as a reload discards both. */
async function waitForPersistedRun(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const raw = sessionStorage.getItem("basics:recommend");
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { agent?: { status?: string; runId?: string | null } };
    return parsed.agent?.status === "running" && Boolean(parsed.agent.runId);
  });
}

test("an agent answer survives leaving Recommend, a reload, and Clear removes it", async ({ page }) => {
  await page.goto("/recommend");
  await openRecommendLayers(page);

  await page.getByLabel("Describe the project", { exact: true }).fill("BASICS_E2E_SLOW API REST para servir modelos");
  await page.getByRole("button", { name: "Recommend", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Backend", exact: true })).toBeVisible();

  const panel = await openPanel(page);
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Running Claude Code");

  // Leave while it streams: the sidebar marks the run and the answer is announced when it ends.
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByText("Agent recommendation running", { exact: true })).toBeVisible();
  await expect(page.getByText("Agent recommendation ready", { exact: true })).toBeVisible({ timeout: 15_000 });

  // The toast action returns to the panel, which shows the finished answer and its citations.
  await page.getByRole("button", { name: "Open Recommend", exact: true }).click();
  await expect(page).toHaveURL(/\/recommend$/);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(ANSWER);
  await expect(panel.getByRole("button", { name: "Select these (1)", exact: true })).toBeVisible();

  // A reload keeps the panel, the answer and the cited techs.
  await page.reload();
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(ANSWER);
  await panel.getByRole("button", { name: "Select these (1)", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "Select FastAPI", exact: true })).toBeChecked();

  // Clear drops the whole session, the agent answer included.
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(panel).toBeHidden();
  await openPanel(page);
  await expect(panel).not.toContainText(ANSWER);
  await expect(panel.getByRole("button", { name: /Select these/ })).toHaveCount(0);
});

test("a reload during a run marks it interrupted and Retry runs it again", async ({ page }) => {
  await page.goto("/recommend");
  await openRecommendLayers(page);

  await page.getByLabel("Describe the project", { exact: true }).fill("BASICS_E2E_SLEEP API REST lenta");
  const panel = await openPanel(page);
  await panel.getByRole("button", { name: "Run", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Running Claude Code");
  await waitForPersistedRun(page);

  await page.reload();
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Interrupted: the page was reloaded", { exact: true })).toBeVisible();

  await panel.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Running Claude Code");
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel.getByText("Cancelled", { exact: true })).toBeVisible();
});
