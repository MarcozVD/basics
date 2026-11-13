import fs from "node:fs";
import { gzipSync } from "node:zlib";
import { expect, test } from "@playwright/test";

const parts = ["explore", "note", "graph", "proposal", "recommend"] as const;
for (const part of parts) {
  test(`${part} embed renders, signals ready once and accepts only parent-origin messages`, async ({ page }) => {
    const errors: string[] = [];
    const api: string[] = [];
    const assets = new Set<string>();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith("/api")) api.push(url.pathname);
      if (/\.(js|css)$/.test(url.pathname)) assets.add(url.pathname);
    });
    await page.route("**/basics/embed-harness", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><body><iframe title="App part" style="width:1000px;height:700px" src="/basics/demo/embed/${part}/?id=${part === "proposal" ? "cli-error-messages" : "nextjs"}&focus=nextjs"></iframe><script>window.ready=[];window.rendered=[];addEventListener('message',e=>{if(e.source===document.querySelector('iframe').contentWindow&&e.origin===location.origin&&e.data.source==='basics-demo'){window.ready.push(e.data);const d=document.querySelector('iframe').contentDocument;window.rendered.push({text:d.body.innerText,rows:d.querySelectorAll('[role=option]').length,canvas:d.querySelectorAll('canvas').length})}});</script></body></html>`,
      }),
    );
    await page.goto("/basics/embed-harness");
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { ready: unknown[] }).ready))
      .toEqual([{ source: "basics-demo", type: "ready", part }]);
    const frame = page.frameLocator('iframe[title="App part"]');
    const rendered = await page.evaluate(
      () => (window as unknown as { rendered: { text: string; rows: number; canvas: number }[] }).rendered[0],
    );
    // Closed select lists also retain hidden option nodes; rendered note rows add 25.
    if (part === "explore") expect(rendered.rows).toBeGreaterThanOrEqual(25);
    if (part === "note") expect(rendered.text).toContain("Backlinks");
    if (part === "proposal") expect(rendered.text).toContain("Actionable CLI errors");
    if (part === "recommend") expect(rendered.text).toContain("Describe your project");
    if (part === "graph") expect(rendered.canvas).toBeGreaterThan(0);
    await expect(frame.locator("[data-embed-part]")).toHaveAttribute("data-embed-part", part);
    await expect(frame.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
    await expect(frame.getByTestId("demo-notice")).toHaveCount(0);
    if (part === "explore") await expect(frame.getByRole("listbox").first().getByRole("option")).toHaveCount(25);
    if (part === "note") {
      await expect(frame.getByRole("heading", { name: "Next.js", exact: true }).first()).toBeVisible();
      await expect(frame.locator("pre")).toContainText('type: "tech"');
      await expect(frame.getByRole("heading", { name: "Backlinks", exact: true })).toBeVisible();
    }
    if (part === "graph") {
      await expect(frame.getByTestId("local-graph-canvas")).toBeVisible();
      await expect(frame.getByTestId("local-graph-canvas")).toHaveAttribute("aria-label", "Knowledge graph: 8 notes, 16 links");
    }
    if (part === "proposal") {
      await expect(frame.getByRole("heading", { name: "Actionable CLI errors", exact: true })).toBeVisible();
    }
    if (part === "recommend") await expect(frame.getByText("Simulated example, not a live recommendation.", { exact: true })).toBeVisible();
    for (const width of [1280, 390]) {
      await page.locator('iframe[title="App part"]').evaluate((element, size) => {
        element.style.width = `${size}px`;
      }, width);
      for (const theme of ["light", "dark"]) {
        await page.evaluate(
          (value) => document.querySelector("iframe")!.contentWindow!.postMessage({ type: "theme", value }, location.origin),
          theme,
        );
        await expect(frame.locator("html")).toHaveClass(theme === "dark" ? /dark/ : /^(?!.*dark)/);
        expect(await frame.locator("main").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(
          theme === "dark" ? "rgb(14, 14, 16)" : "rgb(238, 238, 240)",
        );
        expect(await frame.locator("html").evaluate((element) => element.scrollWidth)).toBeLessThanOrEqual(width);
      }
    }
    await frame.locator("body").evaluate(() =>
      window.dispatchEvent(
        new MessageEvent("message", {
          origin: "https://invalid.example",
          source: window.parent,
          data: { type: "theme", value: "light" },
        }),
      ),
    );
    await expect(frame.locator("html")).toHaveClass(/dark/);
    if (part === "note" || part === "graph") {
      await page.evaluate(() =>
        document.querySelector("iframe")!.contentWindow!.postMessage({ type: "focus", id: "fastapi" }, location.origin),
      );
      await expect
        .poll(() => frame.locator("body").evaluate(() => location.search))
        .toContain(part === "note" ? "id=fastapi" : "focus=fastapi");
      if (part === "note") await expect(frame.getByRole("heading", { name: "FastAPI", exact: true }).first()).toBeVisible();
      else await expect(frame.getByTestId("local-graph-canvas")).not.toHaveAttribute("aria-label", "Knowledge graph: 8 notes, 16 links");
    }
    if (part === "recommend") {
      await page.evaluate(() =>
        document.querySelector("iframe")!.contentWindow!.postMessage({ type: "scenario", id: "data-pipeline" }, location.origin),
      );
      await expect(frame.locator("[data-scenario]")).toHaveAttribute("data-scenario", "data-pipeline");
      await expect(frame.getByRole("link", { name: "Open Python", exact: true })).toBeVisible();
    }
    await expect.poll(() => page.evaluate(() => (window as unknown as { ready: unknown[] }).ready.length)).toBe(1);
    expect(api).toEqual([]);
    expect(errors).toEqual([]);
    if (part !== "graph") expect([...assets].some((asset) => asset.includes("cytoscape"))).toBe(false);
    const files = [...assets].sort().map((asset) => {
      const bytes = fs.readFileSync(new URL(`../../../site/.vitepress/dist/${asset.slice("/basics/".length)}`, import.meta.url));
      return { asset, gzip: gzipSync(bytes).length };
    });
    console.log(
      `EMBED_GZIP ${part} ${JSON.stringify({ js: files.filter((f) => f.asset.endsWith(".js")).reduce((n, f) => n + f.gzip, 0), css: files.filter((f) => f.asset.endsWith(".css")).reduce((n, f) => n + f.gzip, 0), files })}`,
    );
    if (part === "explore") {
      await expect(frame.getByRole("button", { name: "New note", exact: true })).toHaveCount(0);
      await frame.getByRole("option", { name: /^Next\.js/ }).click();
      await expect(frame.getByRole("heading", { name: "Next.js", exact: true }).first()).toBeVisible();
      await expect(frame.locator("[data-embed-part]")).toHaveAttribute("data-embed-part", "note");
      await expect(frame.getByTestId("demo-notice")).toHaveCount(0);
    }
    expect(api).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("proposal embeds approve and reject only in memory", async ({ page }) => {
  for (const action of ["Approve", "Reject"]) {
    await page.goto("/basics/demo/embed/proposal/?id=cli-error-messages");
    await expect(page.getByRole("heading", { name: "Actionable CLI errors", exact: true })).toBeVisible();
    await page.getByRole("button", { name: action, exact: true }).click();
    await expect(page.getByRole("status")).toHaveText(action === "Approve" ? "Approved" : "Rejected");
    expect(
      await page.evaluate(async () =>
        ((await (await fetch("/api/inbox")).json()) as { id: string }[]).some((p) => p.id === "cli-error-messages"),
      ),
    ).toBe(false);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Actionable CLI errors", exact: true })).toBeVisible();
  }
});

test("simulated Recommend matches free text, offers five examples on a miss and keeps Spanish copy", async ({ page }) => {
  const calls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/recommend")) calls.push(r.url());
  });
  await page.goto("/basics/demo/recommend/");
  await expect(page.getByRole("textbox", { name: "Describe your project", exact: true })).toBeVisible();
  await page.evaluate(() => {
    const previous = window.fetch;
    const state = window as unknown as { recommendCalls: string[] };
    state.recommendCalls = [];
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("/api/recommend")) state.recommendCalls.push(url);
      return previous(input, init);
    };
  });
  await page.getByRole("textbox", { name: "Describe your project", exact: true }).fill("a Python REST API");
  await page.getByRole("button", { name: "Show example", exact: true }).click();
  await expect(page.locator("[data-scenario]")).toHaveAttribute("data-scenario", "python-api");
  await page.getByRole("textbox", { name: "Describe your project", exact: true }).fill("something unknown");
  await page.getByRole("button", { name: "Show example", exact: true }).click();
  await expect(page.getByText("No matching example. Try one of these five scenarios.", { exact: true })).toBeVisible();
  for (const name of ["Next.js SaaS", "Python API", "CLI tool", "Mobile app", "Data pipeline"])
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  await page.getByTestId("demo-notice").getByRole("combobox").selectOption("es");
  await page.getByRole("button", { name: "Aplicación móvil", exact: true }).click();
  await expect(page.locator("[data-scenario]")).toHaveAttribute("data-scenario", "mobile-app");
  await expect(page.getByText("Construye una interfaz web móvil adaptable con componentes reutilizables.", { exact: true })).toBeVisible();
  expect(calls).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { recommendCalls: string[] }).recommendCalls)).toEqual([]);
});
