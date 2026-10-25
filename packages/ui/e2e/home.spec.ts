import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { vaultPath } from "./helpers";

function writeProposal(id: string, title: string, body: string) {
  const vault = vaultPath();
  const inboxFile = path.join(vault, "inbox", `${id}.md`);
  fs.rmSync(path.join(vault, "tech", `${id}.md`), { force: true });
  fs.mkdirSync(path.dirname(inboxFile), { recursive: true });
  fs.writeFileSync(
    inboxFile,
    [
      "---",
      "type: tech",
      "kind: framework",
      `title: ${title}`,
      "layer: backend",
      "tags: []",
      "source: agent:e2e",
      "proposal:",
      "  action: create",
      "  proposed_by: e2e",
      "  reason: test",
      `  created: "${new Date().toISOString()}"`,
      "---",
      `# ${title}`,
      "",
      body,
      "",
    ].join("\n"),
  );
}

test("home shows the agent loop and approves from the queue", async ({ page }) => {
  // create-note.spec runs before this file and leaves tech notes behind.
  for (const id of ["drizzle-orm", "hono"]) {
    fs.rmSync(path.join(vaultPath(), "tech", `${id}.md`), { force: true });
  }

  await page.goto("/");

  const techTile = page.locator('[data-stat="tech"]');
  await expect(techTile).toContainText("Tech");
  await expect(techTile).toContainText("9");

  writeProposal("homeflow", "Home flow", "Proposal approved from the Home screen.");

  await expect(page.getByRole("button", { name: /homeflow/i })).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).click();

  await expect(page.getByTestId("inbox-strip")).toContainText("Inbox is clear");
});

test("vault health shows every layer and opens its techs", async ({ page, request }) => {
  const layers = (await (await request.get("/api/layers")).json()) as { id: string; title: string; techs: string[] }[];
  const backend = layers.find((layer) => layer.id === "backend");
  expect(backend).toBeTruthy();
  if (!backend) return;

  await page.goto("/");

  const backendTile = page.locator('[data-stat="layer-backend"]');
  await expect(backendTile).toContainText(backend.title);
  await expect(backendTile.getByText(String(backend.techs.length), { exact: true })).toBeVisible();

  const infraTile = page.locator('[data-stat="layer-infra"]');
  await expect(infraTile).toContainText("Infra");
  await expect(infraTile.getByText("0", { exact: true })).toBeVisible();
  await infraTile.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await backendTile.click();
  const fastapi = page.getByRole("dialog").locator('[data-layer-tech="fastapi"]');
  await expect(fastapi).toContainText("FastAPI");
  await expect(fastapi).toContainText("framework");
  await fastapi.click();
  await expect(page).toHaveURL(/\/notes\/fastapi$/);
});

test("creates the missing note from the broken links tile", async ({ page }) => {
  const file = path.join(vaultPath(), "tech", "broken-source.md");
  fs.writeFileSync(
    file,
    [
      "---",
      "type: tech",
      "kind: library",
      "title: Broken source",
      "layer: backend",
      "---",
      "# Broken source",
      "",
      "Depends on [[ghost-tech]].",
      "",
    ].join("\n"),
  );
  try {
    await page.goto("/");
    // Other specs may leave broken links behind; only this one matters here.
    const tile = page.getByRole("button", { name: /^Broken links: \d+ — Show details$/ });
    await tile.click();

    const row = page.locator('[data-broken-link="ghost-tech"]');
    await expect(row).toContainText("broken-source");
    await row.getByRole("button", { name: "Create note ghost-tech" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByLabel("ID", { exact: true })).toHaveValue("ghost-tech");
    await page.keyboard.press("Escape");

    await tile.click();
    await row.getByRole("button", { name: /^Open broken-source/ }).click();
    await expect(page).toHaveURL(/\/notes\/broken-source$/);
  } finally {
    fs.rmSync(file, { force: true });
  }
});

/** Seed the vault's activity log; returns a restore function for the previous file. */
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

test("activity panel scrolls on its own instead of growing the page", async ({ page }) => {
  const restore = seedActivity(60);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const panel = page.getByTestId("activity-panel");
    await expect(panel).toBeVisible();
    await expect(panel).toHaveAttribute("tabindex", "0");

    // The panel sizes itself after the late Geist swap; measure only once layout has settled.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          void document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        }),
    );

    const metrics = await page.evaluate(() => {
      const activity = document.querySelector<HTMLElement>('[data-testid="activity-panel"]');
      const main = document.querySelector<HTMLElement>("main");
      return {
        viewport: window.innerHeight,
        documentHeight: document.scrollingElement?.scrollHeight ?? 0,
        panelScrollHeight: activity?.scrollHeight ?? 0,
        panelClientHeight: activity?.clientHeight ?? 0,
        mainScrollHeight: main?.scrollHeight ?? 0,
        mainClientHeight: main?.clientHeight ?? 0,
      };
    });

    // The document never scrolls, and neither does <main>: the panel took the remaining space.
    expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.mainScrollHeight).toBeLessThanOrEqual(metrics.mainClientHeight + 1);
    expect(metrics.panelScrollHeight).toBeGreaterThan(metrics.panelClientHeight);

    // The bottom fade appears only once the list extends past the panel.
    const mask = await panel.evaluate((element) => getComputedStyle(element).maskImage);
    expect(mask).not.toBe("none");

    // The panel is focusable and scrolls with the keyboard.
    await panel.focus();
    await page.keyboard.press("End");
    await expect.poll(() => panel.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  } finally {
    restore();
  }
});

/** Wait for the route to render, then for the late Geist swap so measurements are stable. */
async function settle(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => document.querySelector("main h1") !== null);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        void document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      }),
  );
}

/** Temporarily empty the inbox so Home renders its one-line strip; returns a restore function. */
function clearInbox(): () => void {
  const dir = path.join(vaultPath(), "inbox");
  const previous: { name: string; body: string }[] = [];
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith(".md")) previous.push({ name, body: fs.readFileSync(path.join(dir, name), "utf8") });
    }
  }
  fs.mkdirSync(dir, { recursive: true });
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith(".md")) fs.rmSync(path.join(dir, name), { force: true });
  }
  return () => {
    fs.mkdirSync(dir, { recursive: true });
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith(".md")) fs.rmSync(path.join(dir, name), { force: true });
    }
    for (const file of previous) fs.writeFileSync(path.join(dir, file.name), file.body);
  };
}

test("Home fits the desktop window with an empty inbox", async ({ page }) => {
  const restoreActivity = seedActivity(60);
  const restoreInbox = clearInbox();
  try {
    for (const { width, height } of [
      { width: 1280, height: 820 },
      { width: 1100, height: 760 },
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(page.getByTestId("activity-panel")).toBeVisible();
      await settle(page);

      const m = await page.evaluate(() => {
        const strip = document.querySelector<HTMLElement>('[data-testid="inbox-strip"]');
        const panel = document.querySelector<HTMLElement>('[data-testid="activity-panel"]');
        const main = document.querySelector<HTMLElement>("main");
        const grid = document.querySelector<HTMLElement>('[data-testid="home-grid"]')?.getBoundingClientRect();
        const dock = document.querySelector<HTMLElement>("nav")?.getBoundingClientRect();
        return {
          viewport: window.innerHeight,
          documentHeight: document.scrollingElement?.scrollHeight ?? 0,
          mainScrollHeight: main?.scrollHeight ?? 0,
          mainClientHeight: main?.clientHeight ?? 0,
          stripHeight: strip?.getBoundingClientRect().height ?? 0,
          stripText: strip?.textContent ?? "",
          panelScrollHeight: panel?.scrollHeight ?? 0,
          panelClientHeight: panel?.clientHeight ?? 0,
          gridBottom: grid?.bottom ?? 0,
          dockTop: dock?.top ?? 0,
        };
      });

      // The page never scrolls and nothing runs under the Dock.
      expect(m.documentHeight).toBeLessThanOrEqual(m.viewport + 1);
      expect(m.mainScrollHeight).toBeLessThanOrEqual(m.mainClientHeight + 1);
      expect(m.gridBottom).toBeLessThanOrEqual(m.dockTop);
      // The empty inbox collapses to a single line.
      expect(m.stripHeight).toBeLessThanOrEqual(56);
      expect(m.stripText).toContain("Inbox is clear");
      // The activity list is the only thing that scrolls.
      expect(m.panelScrollHeight).toBeGreaterThan(m.panelClientHeight);
    }
  } finally {
    restoreInbox();
    restoreActivity();
  }
});

/** Add `count` layer notes so Home renders a full layer list; returns a cleanup. */
function seedLayers(count: number): () => void {
  const dir = path.join(vaultPath(), "layers");
  fs.mkdirSync(dir, { recursive: true });
  const created: string[] = [];
  for (let index = 1; index <= count; index += 1) {
    const id = `e2e-layer-${index}`;
    const file = path.join(dir, `${id}.md`);
    if (fs.existsSync(file)) continue;
    fs.writeFileSync(file, `---\ntype: layer\ntitle: E2E Layer ${index}\n---\n# E2E Layer ${index}\n`);
    created.push(file);
  }
  return () => {
    for (const file of created) fs.rmSync(file, { force: true });
  };
}

test("Home shows every layer above the Dock with twelve layers", async ({ page }) => {
  // examples/vault ships five layers; add seven to reach the owner's twelve.
  const restoreLayers = seedLayers(7);
  const restoreInbox = clearInbox();
  const restoreActivity = seedActivity(60);
  try {
    for (const { width, height } of [
      { width: 1280, height: 820 },
      { width: 1100, height: 760 },
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(page.getByTestId("activity-panel")).toBeVisible();
      await expect(page.locator('[data-stat^="layer-"]')).toHaveCount(12);
      await settle(page);

      const m = await page.evaluate(() => {
        const dockTop = document.querySelector<HTMLElement>("nav")?.getBoundingClientRect().top ?? 0;
        const rows = [...document.querySelectorAll<HTMLElement>('[data-stat^="layer-"]')].map((row) => {
          const rect = row.getBoundingClientRect();
          return { top: rect.top, bottom: rect.bottom, text: row.textContent ?? "", visible: row.checkVisibility() };
        });
        return { dockTop, rows };
      });

      // All twelve layers render and the last row clears the Dock at both sizes.
      expect(m.rows.length, `${width}x${height}`).toBe(12);
      for (const row of m.rows) {
        expect(row.text, `${width}x${height}`).not.toBe("");
        expect(row.visible, `${row.text} visible at ${width}x${height}`).toBe(true);
        expect(row.top, `${row.text} top at ${width}x${height}`).toBeGreaterThanOrEqual(0);
        expect(row.bottom, `${row.text} bottom at ${width}x${height}`).toBeLessThanOrEqual(m.dockTop);
      }
    }
  } finally {
    restoreActivity();
    restoreInbox();
    restoreLayers();
  }
});

test("Home keeps the stats, layers and recent notes in three columns from 1440", async ({ page }) => {
  // Seeded activity makes the first column as tall as the grid, so the row alignment is real.
  const restoreActivity = seedActivity(60);
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await expect(page.getByTestId("activity-panel")).toBeVisible();
    await expect(page.locator('[data-stat^="layer-"]').first()).toBeVisible();
    await settle(page);

    const m = await page.evaluate(() => {
      const rect = (selector: string) => {
        const box = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
        return box ? { top: box.top, bottom: box.bottom, left: box.left, right: box.right } : null;
      };
      const activity = document.querySelector<HTMLElement>('[data-testid="activity-panel"]')?.getBoundingClientRect();
      return {
        activity: activity ? { top: activity.top, bottom: activity.bottom, left: activity.left, right: activity.right } : null,
        health: rect('[aria-label="Vault health & shape"]'),
        layers: rect('[aria-label="Layers"]'),
        recent: rect('[data-testid="recent-section"]'),
        dockTop: document.querySelector<HTMLElement>("nav")?.getBoundingClientRect().top ?? 0,
      };
    });

    expect(m.activity).not.toBeNull();
    expect(m.health).not.toBeNull();
    expect(m.layers).not.toBeNull();
    expect(m.recent).not.toBeNull();
    if (!m.activity || !m.health || !m.layers || !m.recent) return;

    // Activity | stats above layers | recently edited, with all three starting on the same row.
    expect(m.activity.right).toBeLessThan(m.health.left);
    expect(m.health.left).toBeCloseTo(m.layers.left, 0);
    expect(m.health.right).toBeCloseTo(m.layers.right, 0);
    expect(m.layers.bottom).toBeLessThan(m.recent.bottom);
    expect(m.layers.right).toBeLessThan(m.recent.left);
    expect(m.recent.top).toBeCloseTo(m.health.top, 0);
    expect(m.recent.bottom).toBeLessThanOrEqual(m.dockTop);
  } finally {
    restoreActivity();
  }
});

test("Broken links is alarmed only while it has links and keeps its actions", async ({ page, request }) => {
  const file = path.join(vaultPath(), "tech", "broken-alert-source.md");
  fs.writeFileSync(
    file,
    [
      "---",
      "type: tech",
      "kind: library",
      "title: Broken alert source",
      "layer: backend",
      "---",
      "# Broken alert source",
      "",
      "Depends on [[ghost-alert]].",
      "",
    ].join("\n"),
  );
  const stat = page.locator('[data-stat="broken"]');
  const alertMarks = stat.locator(".text-destructive-text");
  const brokenCount = async () => {
    const stats = (await (await request.get("/api/stats")).json()) as { brokenLinks: { from: string; to: string }[] };
    return stats.brokenLinks.length;
  };

  try {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/");
    await settle(page);

    await expect.poll(brokenCount).toBeGreaterThan(0);
    // The alert is real styling, not only a test hook.
    await expect(alertMarks.first()).toBeVisible();
    await expect(stat).toHaveAttribute("data-alert", "true");

    // The popover still offers Open and Create.
    await page.getByRole("button", { name: /^Broken links: \d+ — Show details$/ }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator('[data-broken-link="ghost-alert"]')).toBeVisible();
    await expect(dialog.getByRole("button", { name: /^Open broken-alert-source/ })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Create note ghost-alert" })).toBeVisible();
    await page.keyboard.press("Escape");

    fs.rmSync(file, { force: true });
    await page.reload();
    await settle(page);

    // Alert styling tracks the value: shown exactly while it is above zero.
    await expect
      .poll(async () => {
        const count = await brokenCount();
        const marks = await alertMarks.count();
        return count > 0 ? marks > 0 : marks === 0;
      })
      .toBe(true);
    if ((await brokenCount()) === 0) await expect(stat).not.toHaveAttribute("data-alert", "true");
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("Home previews three proposals and links to the rest", async ({ page }) => {
  const ids = ["pending-1", "pending-2", "pending-3", "pending-4", "pending-5"];
  for (const id of ids) writeProposal(id, `Proposal ${id}`, "Pending body.");
  try {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/");

    const strip = page.getByTestId("inbox-strip");
    await expect(strip).toBeVisible();
    await expect(strip.locator("[data-proposal-open]")).toHaveCount(3);
    await expect(strip.getByRole("link", { name: /See all \(5\)/ })).toBeVisible();
  } finally {
    for (const id of ids) {
      fs.rmSync(path.join(vaultPath(), "inbox", `${id}.md`), { force: true });
      fs.rmSync(path.join(vaultPath(), "tech", `${id}.md`), { force: true });
    }
  }
});
