import { expect, test } from "@playwright/test";

const CLIENTS = [
  "Claude Code",
  "opencode",
  "Codex",
  "Cursor",
  "Claude Desktop",
  "oh-my-pi",
  "Gemini CLI",
  "Qwen Code",
  "Kimi CLI",
  "Goose",
  "Amp",
];

test.afterEach(async ({ request }) => {
  await request.put("/api/config", { data: { language: "en" } });
});

test("opens Settings with Ctrl+, and the sidebar marks it current", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Control+,");
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.getByTestId("sidebar").getByRole("link", { name: "Settings" })).toHaveAttribute("aria-current", "page");

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

test("the Navigation choice sits on the same row as its label", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  await page.goto("/settings");

  const label = page.getByText("Navigation", { exact: true });
  const group = page.getByRole("group", { name: "Navigation" });
  await expect(group).toBeVisible();

  const [labelBox, groupBox] = await Promise.all([label.boundingBox(), group.boundingBox()]);
  expect(labelBox).not.toBeNull();
  expect(groupBox).not.toBeNull();

  // Same row: the control starts beside the label, not on the line below it.
  expect(groupBox!.y).toBeLessThan(labelBox!.y + 30);
  // Aligned right: the control clears the label text and its description column.
  expect(groupBox!.x).toBeGreaterThan(labelBox!.x + 200);
});

test("Agents lists every client and connects, then disconnects, Cursor", async ({ page }) => {
  await page.goto("/settings?section=agents");
  await expect(page.getByRole("heading", { name: "Agents", level: 2 })).toBeVisible();

  await page.getByText("Other agents", { exact: true }).click();

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

test("Gemini preset connects in temp HOME and exposes its change", async ({ page }) => {
  await page.goto("/settings?section=agents");
  const row = page.locator('[data-client="gemini-cli"]');
  await expect(row.getByText("Installed, not connected")).toBeVisible();
  await row.getByRole("button", { name: "Connect", exact: true }).press("Enter");
  await expect(row.getByText("Connected", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Show what changed" }).press("Enter");
  await expect(row.locator("pre")).toContainText("mcpServers");
  await expect(row.getByText("Skill installed", { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Disconnect", exact: true }).press("Enter");
  await expect(row.getByText("Installed, not connected")).toBeVisible();
});

for (const language of ["en", "es"] as const) {
  for (const theme of ["light", "dark"] as const) {
    test(`Other agent snippets copy with keyboard: ${language}, ${theme}`, async ({ page, context }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.addInitScript(
        ({ language, theme }) => {
          localStorage.setItem("basics-language", language);
          localStorage.setItem("basics-theme", theme);
        },
        { language, theme },
      );
      // The persisted server language owns localization; change it through Settings.
      await page.goto("/settings");
      await page.getByRole("tab", { name: language === "es" ? "Español" : "English" }).click();
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 820 });
        await page.goto("/settings?section=agents");
        await expect(page.locator("html")).toHaveAttribute("lang", language);
        if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
        else await expect(page.locator("html")).not.toHaveClass(/dark/);
        const summary = page.locator("summary").filter({ hasText: language === "es" ? "Otro agente:" : "Other agent:" });
        await summary.press("Enter");
        const snippets = await page.request
          .get("/api/connect/status")
          .then((response) => response.json())
          .then((status) => status.snippets);
        for (const format of ["json", "toml", "http", "command"]) {
          const block = page.locator(`[data-snippet="${format}"]`);
          await expect(block.locator("pre")).toHaveText(snippets[format]);
          await block.getByRole("button").press("Enter");
          // The Windows clipboard normalizes text to CRLF.
          expect((await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, "\n")).toBe(snippets[format]);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
    });
  }
}

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
