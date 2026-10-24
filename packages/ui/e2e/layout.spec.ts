import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { vaultPath } from "./helpers";

/** Seed the vault's activity log so Home renders its scrollable activity panel. */
function seedActivity(count: number): () => void {
  const dir = path.join(vaultPath(), ".basics");
  const file = path.join(dir, "activity.jsonl");
  fs.mkdirSync(dir, { recursive: true });
  const previous = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
  const now = Date.now();
  const lines = Array.from({ length: count }, (_, index) =>
    JSON.stringify({
      // Alternating agents keep every event its own row instead of collapsing into groups.
      ts: new Date(now - index * 60_000).toISOString(),
      agent: index % 2 === 0 ? "claude-code" : "opencode",
      tool: "get_note",
      noteIds: ["fastapi"],
    }),
  );
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
  return () => {
    if (previous === null) fs.rmSync(file, { force: true });
    else fs.writeFileSync(file, previous);
  };
}

/** Wait for the late Geist swap so measurements are stable. */
async function settle(page: import("@playwright/test").Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        void document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }),
  );
}

interface LayoutMetrics {
  headerPadLeft: number;
  h1Left: number | null;
  dockTop: number;
  lastTileBottom: number | null;
  panelClientHeight: number | null;
  panelScrollHeight: number | null;
  rowHeight: number | null;
}

async function measureHome(page: import("@playwright/test").Page): Promise<LayoutMetrics> {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("main");
    const header = document.querySelector<HTMLElement>("header");
    const dock = document.querySelector<HTMLElement>("nav")?.getBoundingClientRect();
    const h1 = document.querySelector<HTMLElement>("h1")?.getBoundingClientRect();
    const tiles = document.querySelectorAll<HTMLElement>("[data-stat]");
    // Scroll the page's own container to its end before measuring the last tile.
    if (main) main.scrollTop = main.scrollHeight;
    const last = tiles[tiles.length - 1]?.getBoundingClientRect();
    const panel = document.querySelector<HTMLElement>('[data-testid="activity-panel"]');
    const row = panel?.querySelector("li")?.getBoundingClientRect();
    return {
      headerPadLeft: header ? Number.parseFloat(getComputedStyle(header).paddingLeft) : 0,
      h1Left: h1 ? h1.left : null,
      dockTop: dock ? dock.top : 0,
      lastTileBottom: last ? last.bottom : null,
      panelClientHeight: panel ? panel.clientHeight : null,
      panelScrollHeight: panel ? panel.scrollHeight : null,
      rowHeight: row ? row.height : null,
    };
  });
}

test("Home clears the Dock and caps the activity panel on desktop sizes", async ({ page }) => {
  const restore = seedActivity(60);
  try {
    for (const { width, height, gutter } of [
      { width: 1280, height: 820, gutter: 40 },
      { width: 900, height: 700, gutter: 32 },
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(page.getByTestId("activity-panel")).toBeVisible();
      await settle(page);

      const m = await measureHome(page);

      // The top bar's left edge and the page title share the gutter for this width.
      expect(m.headerPadLeft).toBe(gutter);
      expect(m.h1Left).toBe(gutter);

      // Scrolled to the end, the last health tile's bottom sits above the Dock's top.
      expect(m.lastTileBottom).not.toBeNull();
      expect(m.lastTileBottom as number).toBeLessThan(m.dockTop);

      // Below 1024 the stacked layout caps the panel at ~8 rows and lets it scroll.
      if (width < 1024) {
        expect(m.rowHeight).not.toBeNull();
        const cap = (m.rowHeight as number) * 8;
        expect(m.panelClientHeight as number).toBeLessThanOrEqual(cap + 2);
        expect(m.panelScrollHeight as number).toBeGreaterThan(m.panelClientHeight as number);
      }
    }
  } finally {
    restore();
  }
});

test("every page shares the top bar gutter", async ({ page }) => {
  for (const route of ["/", "/explore", "/projects", "/inbox", "/recommend"]) {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto(route);
    await settle(page);
    const m = await measureHome(page);
    expect(m.headerPadLeft).toBe(40);
    expect(m.h1Left, `page title left on ${route}`).toBe(40);
  }
});
