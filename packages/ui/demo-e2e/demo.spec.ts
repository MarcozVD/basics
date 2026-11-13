import { test as base, expect } from "@playwright/test";

const test = base.extend<{ networkGuard: undefined }>({
  networkGuard: [
    async ({ page }, use) => {
      const failures: string[] = [];
      const apiRequests: string[] = [];
      const errors: string[] = [];
      page.on("requestfailed", (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
      page.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/api")) apiRequests.push(request.url());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() => {
        (window as { __BASICS_E2E__?: boolean }).__BASICS_E2E__ = true;
      });
      await use(undefined);
      expect(apiRequests, "All API/SSE traffic must terminate inside the demo").toEqual([]);
      expect(failures, "Static artifact requests must load successfully").toEqual([]);
      expect(errors, "Demo must not throw browser errors").toEqual([]);
    },
    { auto: true },
  ],
});

test("static demo supports Explore, notes, graph, proposal review, presets and disabled routes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  // Even if the site is opened inside a Tauri webview, the demo must keep native paths off.
  await page.addInitScript(() => Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {} }));
  await page.goto("./");
  await expect(page.getByTestId("demo-notice")).toContainText("Demo, changes reset on reload");
  await expect(page.getByTestId("title-strip")).toHaveCount(0);
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL(/\/basics\/demo\/explore/);
  const next = page.getByRole("option", { name: /Next\.js/ }).first();
  // Explore's listbox options include the title, type and note metadata in their name.
  await expect(next).toBeVisible();
  await next.click();
  await expect(page).toHaveURL(/\/basics\/demo\/notes\/nextjs/);
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Next.js");
  await page.getByRole("link", { name: "Graph", exact: true }).click();
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => (window as { __basicsCy?: { nodes: () => { length: number } } }).__basicsCy?.nodes().length ?? 0))
    .toBeGreaterThan(0);
  await page.goto("./inbox/cli-error-messages/");
  await expect(page.getByRole("heading", { name: "Actionable CLI errors", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect
    .poll(
      () =>
        page.evaluate(async () =>
          ((await (await fetch("/api/inbox")).json()) as { id: string }[]).some((proposal) => proposal.id === "cli-error-messages"),
        ),
      { timeout: 12_000 },
    )
    .toBe(false);
  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page.getByRole("option", { name: /Actionable CLI errors/ }).first()).toBeVisible();
  await page.getByRole("link", { name: "Recommend", exact: true }).click();
  await page.getByRole("button", { name: "Python API", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Backend", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open FastAPI", exact: true }).first()).toBeVisible();
  await page.getByTestId("demo-notice").getByRole("combobox").selectOption("es");
  await expect(page.getByRole("button", { name: "API de Python", exact: true })).toBeVisible();
  await page.getByTestId("demo-notice").getByRole("combobox").selectOption("en");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Not in the demo. Install Basics to use this.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Install Basics", exact: true })).toHaveAttribute(
    "href",
    "/basics/guide/getting-started.html",
  );
  await page.reload();
  await expect(page.getByRole("heading", { name: "Not in the demo", exact: true })).toBeVisible();
});

test("in-memory changes reset on reload and unknown endpoints stay local", async ({ page }) => {
  await page.goto("./explore/");
  await expect(page.getByTestId("demo-notice")).toBeVisible();
  expect(
    await page.evaluate(async () => {
      await fetch("/api/inbox/react-components/reject", { method: "POST" });
      const missing = await fetch("/api/never-recorded");
      const events = await fetch("/api/events");
      return { inbox: ((await (await fetch("/api/inbox")).json()) as unknown[]).length, missing: missing.status, events: events.status };
    }),
  ).toEqual({ inbox: 2, missing: 404, events: 204 });
  await page.reload();
  await expect(page.getByTestId("demo-notice")).toBeVisible();
  expect(await page.evaluate(async () => ((await (await fetch("/api/inbox")).json()) as unknown[]).length)).toBe(3);
});

for (const width of [1280, 390])
  for (const theme of ["dark", "light"]) {
    test(`demo controls work with keyboard in both languages: ${width}px ${theme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 820 });
      await page.emulateMedia({ colorScheme: theme as "dark" | "light" });
      await page.goto("./settings/");
      const badge = page.getByTestId("demo-notice");
      await expect(badge).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Skip to content", exact: true })).toBeFocused();
      const language = badge.getByRole("combobox");
      await language.selectOption("es");
      await expect(badge).toContainText("Demo, los cambios se reinician al recargar");
      await expect(page.getByText("No disponible en la demo. Instala Basics para usar esta función.", { exact: true })).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", "es");
      const themeButton = badge.getByRole("button");
      await themeButton.focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("html")).toHaveClass(theme === "dark" ? /^(?!.*\bdark\b).*$/ : /dark/);
      const boxes = await page.evaluate(() => {
        const badge = document.querySelector('[data-testid="demo-notice"]')!.getBoundingClientRect();
        const panel = document.querySelector('[data-testid="content-panel"]')!.getBoundingClientRect();
        return { badgeBottom: badge.bottom, panelTop: panel.top, width: document.documentElement.scrollWidth, viewport: innerWidth };
      });
      expect(boxes.badgeBottom).toBeLessThanOrEqual(boxes.panelTop);
      expect(boxes.width).toBeLessThanOrEqual(boxes.viewport);
      await language.selectOption("en");
      await expect(page.getByText("Not in the demo. Install Basics to use this.", { exact: true })).toBeVisible();
    });
  }
