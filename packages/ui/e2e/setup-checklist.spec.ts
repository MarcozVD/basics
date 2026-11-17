import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { vaultPath } from "./helpers";

test("only a saved approval counts, including pack proposals after the undo window", async ({ page, request }) => {
  const id = "setup-pack-proof";
  const file = path.join(vaultPath(), "inbox", `${id}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    [
      "---",
      "type: tech",
      "kind: framework",
      "title: Setup pack proof",
      "layer: backend",
      "source: pack:setup@1.0.0",
      "proposal:",
      "  action: create",
      "  proposed_by: pack:setup@1.0.0",
      "  reason: First approval",
      `  created: "${new Date().toISOString()}"`,
      "---",
      "# Setup pack proof",
      "",
    ].join("\n"),
  );
  await page.route("**/api/notes", (route) => route.fulfill({ json: [] }));
  await page.route("**/api/connect/status", (route) => route.fulfill({ json: { clients: [] } }));
  const health = await (await request.get("/api/health")).json();
  const marker = `basics:setup:approved:${health.vault}`;
  try {
    await page.goto(`/inbox/${id}`);
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await page.getByRole("button", { name: "Undo (Z)", exact: true }).click();
    expect(await page.evaluate((key) => localStorage.getItem(key), marker)).toBeNull();
    expect(fs.existsSync(file)).toBe(true);
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(1);
    await page.getByRole("button", { name: "Approve", exact: true }).click();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), marker), { timeout: 15000 }).toBe("1");
    expect(fs.existsSync(file)).toBe(false);
    await page.goto("/");
    await expect(page.getByTestId("home-getting-started").locator('[data-step="proposal"]')).toHaveAttribute("data-complete", "true");
  } finally {
    fs.rmSync(file, { force: true });
    fs.rmSync(path.join(vaultPath(), "tech", `${id}.md`), { force: true });
  }
});

test("checklist follows API state, hides on completion and remembers dismissal per vault", async ({ page }) => {
  let vault = "setup-checklist-one";
  let installed = false;
  let connected = false;
  let approved = false;
  await page.route("**/api/health", (route) => route.fulfill({ json: { ok: true, vault, version: "test" } }));
  await page.route("**/api/packs", (route) => route.fulfill({ json: [{ name: "test", installed: installed ? "1.0.0" : null }] }));
  await page.route("**/api/connect/status", (route) => route.fulfill({ json: { vault, clients: [{ detected: true, connected }] } }));
  await page.route("**/api/notes", (route) =>
    route.fulfill({
      json: [{ id: "test", title: "Test", type: "tech", source: approved ? "agent:test" : "manual", layers: [], tags: [] }],
    }),
  );
  await page.goto("/");
  const checklist = page.getByTestId("home-getting-started");
  await expect(checklist.locator('[data-step="vault"]')).toHaveAttribute("data-complete", "true");
  for (const id of ["pack", "agent", "proposal"])
    await expect(checklist.locator(`[data-step="${id}"]`)).toHaveAttribute("data-complete", "false");
  await expect(checklist.getByRole("link", { name: "Install a pack" })).toHaveAttribute("href", "/?packs=1");
  await expect(checklist.getByRole("link", { name: "Connect an agent" })).toHaveAttribute("href", "/settings?section=agents");
  await expect(checklist.getByRole("link", { name: "Approve your first proposal" })).toHaveAttribute("href", "/inbox");
  installed = true;
  await page.reload();
  await expect(checklist.locator('[data-step="pack"]')).toHaveAttribute("data-complete", "true");
  await expect(checklist.locator('[data-step="agent"]')).toHaveAttribute("data-complete", "false");
  connected = true;
  approved = true;
  await page.reload();
  await expect(checklist).toHaveCount(0);
  installed = false;
  await page.reload();
  await expect(checklist).toBeVisible();
  const dismiss = checklist.getByRole("button", { name: "Dismiss setup" });
  await dismiss.focus();
  await page.keyboard.press("Enter");
  await expect(checklist).toHaveCount(0);
  await page.reload();
  await expect(checklist).toHaveCount(0);
  vault = "setup-checklist-two";
  await page.reload();
  await expect(checklist).toBeVisible();
});

for (const language of ["en", "es"] as const) {
  for (const theme of ["light", "dark"]) {
    test(`${language} ${theme}: checklist remains readable and keyboard accessible at 390 and 1280px`, async ({ page }) => {
      await page.route("**/api/config", (route) => route.fulfill({ json: { language } }));
      await page.route("**/api/packs", (route) => route.fulfill({ json: [] }));
      await page.route("**/api/connect/status", (route) => route.fulfill({ json: { clients: [] } }));
      await page.route("**/api/notes", (route) => route.fulfill({ json: [] }));
      await page.addInitScript((value) => localStorage.setItem("basics-theme", value), theme);
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme as "light" | "dark" });
        await page.goto("/");
        const checklist = page.getByTestId("home-getting-started");
        await checklist.scrollIntoViewIfNeeded();
        await expect(checklist.getByRole("listitem")).toHaveCount(4);
        await expect(checklist.getByRole("heading", { name: language === "en" ? "Get set up" : "Primeros pasos" })).toBeVisible();
        const glossary = checklist.getByRole("link", { name: /Terms explained|Términos explicados/ });
        await expect(glossary).toHaveAttribute("href", "https://marcozvd.github.io/basics/guide/glossary.html");
        await glossary.focus();
        await expect(glossary).toBeFocused();
        expect(await glossary.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
    });
  }
}
