import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) {
  for (const theme of ["dark", "light"]) {
    test(`recorded compare ${width}px ${theme}, English and Spanish, no agent/network execution`, async ({ page }) => {
      const apiRequests: string[] = [];
      const errors: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname.startsWith("/api")) apiRequests.push(request.url());
      });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((theme) => localStorage.setItem("basics-theme", theme), theme);
      await page.goto("./compare/");
      if (theme === "dark") await expect(page.locator("html")).toHaveClass(/dark/);
      else await expect(page.locator("html")).not.toHaveClass(/dark/);
      await expect(page.getByRole("heading", { name: "Compare", exact: true })).toBeVisible();
      await expect(page.getByText("One recorded run", { exact: true })).toBeVisible();
      await expect(page.getByText(/not evidence of a general improvement/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Review run", exact: true })).toBeDisabled();
      const results = page.getByTestId("compare-results");
      const summary = page.getByTestId("compare-summary");
      await expect(summary.getByRole("table", { name: "At a glance", exact: true })).toBeVisible();
      await expect(summary).toContainText("0 of 2 layers");
      await expect(summary).toContainText("2 of 2 approved");
      await expect(results).toContainText("Used: none detected");
      await expect(results.getByRole("heading", { name: "No notes", exact: true })).toBeVisible();
      await expect(results.getByRole("heading", { name: "Basics MCP + notes", exact: true })).toBeVisible();
      await expect(summary.getByRole("columnheader", { name: "No notes", exact: true })).toBeVisible();
      await expect(summary.getByRole("columnheader", { name: "Basics MCP + notes", exact: true })).toBeVisible();
      await expect(summary.getByRole("columnheader", { name: "Exported notes", exact: true })).toHaveCount(0);
      await expect(page.getByText("Not run in this recording: Exported notes.", { exact: true })).toBeVisible();
      await expect(results.locator(":scope > div")).toHaveCount(2);
      await expect(results.getByText("Checks: 2/2", { exact: true })).toBeVisible();
      await expect(results.getByText("40,381", { exact: true })).toBeVisible();
      await results.getByText("Assistant output excerpt", { exact: true }).first().click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width === 390) {
        await page.evaluate(() => {
          const main = document.getElementById("main-content");
          if (main) main.scrollTop = 120;
        });
        const bar = await page.evaluate(() => ({
          menuBottom: document.querySelector('[data-testid="sidebar-menu"]')?.getBoundingClientRect().bottom ?? 0,
          mainTop: document.getElementById("main-content")?.getBoundingClientRect().top ?? 0,
        }));
        expect(bar.menuBottom).toBeLessThanOrEqual(bar.mainTop + 0.5);
      }
      const columns = await results
        .locator(":scope > div")
        .evaluateAll((nodes) => nodes.map((node) => ({ x: node.getBoundingClientRect().x, y: node.getBoundingClientRect().y })));
      expect(width === 1280 ? columns[0].y === columns[1].y : columns[0].x === columns[1].x).toBe(true);
      await page.getByTestId("demo-notice").getByRole("combobox").selectOption("es");
      await expect(page.getByRole("heading", { name: "Comparar", exact: true })).toBeVisible();
      await expect(page.getByText("Una ejecución grabada", { exact: true })).toBeVisible();
      await expect(results.getByRole("heading", { name: "Sin notas", exact: true })).toBeVisible();
      await expect(results.getByRole("heading", { name: "MCP de Basics + notas", exact: true })).toBeVisible();
      await expect(page.getByText("No se ejecutó en esta grabación: Notas exportadas.", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // Keyboard disclosure and visible focus, including reduced-motion mode from the config.
      const disclosure = results.locator("details").first();
      const wasOpen = await disclosure.evaluate((node) => (node as HTMLDetailsElement).open);
      await disclosure.locator("summary").focus();
      await page.keyboard.press("Enter");
      await expect(disclosure).toHaveJSProperty("open", !wasOpen);
      expect(apiRequests).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test("history omits an empty model and confirms deleting only one saved result", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  // Test-only live-history responses around the read-only demo shim. No server or agent writes.
  await page.addInitScript(() => {
    const deleted: string[] = [];
    Object.assign(window, { __compareDeleted: deleted });
    let current = window.fetch.bind(window);
    Object.defineProperty(window, "fetch", {
      configurable: true,
      get: () => current,
      set(fetcher: typeof fetch) {
        current = async (...args: Parameters<typeof fetch>) => {
          const input = args[0];
          const url = new URL(input instanceof Request ? input.url : String(input), location.href);
          const method = (args[1]?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
          if (url.pathname.startsWith("/api/compare/history/") && method === "DELETE") {
            deleted.push(url.pathname);
            return new Response(null, { status: 204 });
          }
          const response = await fetcher(...args);
          if (method !== "GET" || !["/api/compare/state", "/api/compare/history"].includes(url.pathname)) return response;
          const data = await response.json();
          if (url.pathname.endsWith("/state") && data?.report) {
            data.report.recorded = false;
            data.report.model = null;
            data.report.runs = 2;
            data.report.results.push(...structuredClone(data.report.results).map((result: { run: number }) => ({ ...result, run: 2 })));
            if (deleted.length) delete data.report;
          } else if (Array.isArray(data)) {
            for (const item of data) item.model = null;
            if (deleted.length) data.length = 0;
          }
          return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
        };
      },
    });
  });
  await page.goto("./compare/");
  const history = page.getByRole("region", { name: "History", exact: true });
  await expect(history.getByRole("button", { name: /^Open result:/ })).toBeVisible();
  await expect(history).not.toContainText(/·\s*·/);
  await expect(page.getByTestId("compare-summary")).toContainText("Mean:");
  await expect(page.getByTestId("compare-summary")).toContainText("SD: 0");
  await history.getByRole("button", { name: /^Delete result:/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Delete this result?", exact: true })).toBeVisible();
  await expect(dialog).toContainText("Only this saved result is deleted");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await page.evaluate(() => (window as unknown as { __compareDeleted: string[] }).__compareDeleted)).toEqual([]);
  await page.getByTestId("demo-notice").getByRole("combobox").selectOption("es");
  await page
    .getByRole("region", { name: "Historial", exact: true })
    .getByRole("button", { name: /^Eliminar resultado:/ })
    .click();
  await expect(dialog).toContainText("Solo se elimina este resultado guardado");
  await dialog.getByRole("button", { name: "Eliminar resultado", exact: true }).click();
  await expect(page.getByText("Aún no hay comparaciones. Elige una tarea para empezar.", { exact: true })).toBeVisible();
  const deleted = await page.evaluate(() => (window as unknown as { __compareDeleted: string[] }).__compareDeleted);
  expect(deleted).toHaveLength(1);
  expect(deleted[0]).toMatch(/^\/api\/compare\/history\/[^/]+$/);
});
