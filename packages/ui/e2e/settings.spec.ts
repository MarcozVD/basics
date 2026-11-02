import { expect, test } from "@playwright/test";

const CLIENTS = ["Claude Code", "opencode", "Codex", "Cursor", "Claude Desktop"];

test("opens Settings with Ctrl+, and the header gear marks it current", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Control+,");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");

  // The section list is a keyboard path: arrows move the selection, `aria-current` follows.
  const general = page.getByRole("button", { name: "General", exact: true });
  await expect(general).toHaveAttribute("aria-current", "true");
  await general.press("ArrowDown");
  await expect(page.getByRole("button", { name: "Startup", exact: true })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("heading", { name: "Startup", level: 2 })).toBeVisible();
});

test("the command palette jumps to Settings", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Command palette" });
  await expect(dialog).toBeVisible();

  await page.getByRole("combobox").fill("settings");
  await dialog
    .getByRole("option", { name: /Settings/ })
    .first()
    .click();

  await expect(page).toHaveURL(/\/settings$/);
});

test("language and theme save from General without a Save button", async ({ page }) => {
  await page.goto("/settings");

  await page.getByRole("tab", { name: "Español" }).click();
  await expect(page.getByRole("heading", { name: "Configuración", level: 1 })).toBeVisible();

  await page.getByRole("tab", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();

  await page.getByRole("tab", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await page.evaluate(() => localStorage.getItem("basics-theme"))).toBe("dark");

  await page.getByRole("tab", { name: "System" }).click();
  expect(await page.evaluate(() => localStorage.getItem("basics-theme"))).toBe("system");

  // The vault buttons only exist in the desktop app; a browser keeps the CLI hint.
  await expect(page.getByRole("button", { name: "Open folder" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change folder" })).toHaveCount(0);
  await expect(page.getByText("basics config set vault")).toBeVisible();
});

test("Agents lists every client and connects, then disconnects, Cursor", async ({ page }) => {
  await page.goto("/settings?section=agents");
  await expect(page.getByRole("heading", { name: "Agents", level: 2 })).toBeVisible();

  for (const client of CLIENTS) {
    await expect(page.getByText(client, { exact: true })).toBeVisible();
  }

  // The e2e server runs with a throwaway home that only has `.cursor/`, so nothing else is shown
  // as installed and writing to Cursor's config can never touch the machine running the tests.
  const row = page.locator('[data-client="cursor"]');
  await expect(row.getByText("Installed, not connected")).toBeVisible();

  await row.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(row.getByText("Connected", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "Show what changed" }).click();
  await expect(row.locator("pre")).toContainText("mcpServers");

  await row.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(row.getByText("Installed, not connected")).toBeVisible();
});

test("Startup and Updates point at the desktop app in a browser", async ({ page }) => {
  await page.goto("/settings?section=startup");
  await expect(page.getByRole("heading", { name: "Startup", level: 2 })).toBeVisible();
  await expect(page.getByText("Available in the desktop app")).toBeVisible();
  await expect(page.getByRole("link", { name: "Desktop app guide" })).toHaveAttribute(
    "href",
    "https://marcozvd.github.io/basics/guide/desktop.html",
  );

  await page.goto("/settings?section=updates");
  await expect(page.getByRole("heading", { name: "Updates", level: 2 })).toBeVisible();
  await expect(page.getByText("Available in the desktop app")).toBeVisible();
});
