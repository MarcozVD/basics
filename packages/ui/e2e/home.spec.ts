import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { vaultPath } from "./helpers";

function writeProposal(id: string, title: string, body: string, reason = "test") {
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
      `  reason: ${reason}`,
      `  created: "${new Date().toISOString()}"`,
      "---",
      `# ${title}`,
      "",
      body,
      "",
    ].join("\n"),
  );
}

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

test("home shows the agent loop and reviews from the queue", async ({ page }) => {
  // create-note.spec runs before this file and leaves tech notes behind.
  for (const id of ["drizzle-orm", "hono"]) {
    fs.rmSync(path.join(vaultPath(), "tech", `${id}.md`), { force: true });
  }

  try {
    await page.goto("/");

    // Health is one line of live counts, not the old type tiles.
    const health = page.getByTestId("health-line");
    await expect(health).toContainText(/\d+ notes/);
    await expect(page.locator('[data-stat="notes"]')).toBeVisible();

    writeProposal("homeflow", "Home flow", "Proposal reviewed from the Home screen.");

    await expect(page.getByRole("button", { name: /homeflow/i })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve", exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Review", exact: true }).click();
    await expect(page).toHaveURL(/\/inbox\/homeflow$/);
    await expect(page.locator("[data-proposal-detail]")).toBeVisible();

    // Review is navigation only: the proposal remains pending and no note is written.
    expect(fs.existsSync(path.join(vaultPath(), "inbox", "homeflow.md"))).toBe(true);
    expect(fs.existsSync(path.join(vaultPath(), "tech", "homeflow.md"))).toBe(false);

    await page.getByRole("button", { name: "Back to Home" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("inbox-strip")).toContainText("Home flow");
  } finally {
    fs.rmSync(path.join(vaultPath(), "inbox", "homeflow.md"), { force: true });
    fs.rmSync(path.join(vaultPath(), "tech", "homeflow.md"), { force: true });
  }
});

test("the get-set-up checklist leaves once notes, an agent and a project are in place", async ({ page, request }) => {
  const file = path.join(vaultPath(), "projects", "e2e-setup-project.md");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, ["---", "type: project", "title: E2E Setup", "status: active", "---", "", "# E2E Setup", ""].join("\n"));

  expect((await request.post("/api/connect", { data: { clients: ["cursor"] } })).ok()).toBe(true);
  try {
    // Preconditions on the fixture: the temp vault has notes, and now a project and a connected agent too.
    await expect.poll(async () => (await (await request.get("/api/stats")).json()).counts.project).toBeGreaterThan(0);
    await expect
      .poll(async () =>
        (await (await request.get("/api/connect/status")).json()).clients.some((client: { connected: boolean }) => client.connected),
      )
      .toBe(true);

    await page.goto("/");
    // Home rendered with stats before we check the checklist took itself off the page.
    await expect(page.getByTestId("health-line")).toBeVisible();
    await expect(page.getByTestId("home-getting-started")).toHaveCount(0);
  } finally {
    fs.rmSync(file, { force: true });
    await request.post("/api/disconnect", { data: { clients: ["cursor"] } });
  }
});

/** Seed the vault's activity log with today's events; returns a restore function for the previous file. */
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

test("Home keeps one column in reading order and drops the old type and layer blocks", async ({ page }) => {
  const restore = seedActivity(6);
  try {
    for (const { width, height } of [
      { width: 1280, height: 820 },
      { width: 900, height: 760 },
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto("/");
      await expect(page.getByTestId("health-line")).toBeVisible();
      await expect(page.getByTestId("continue-list")).toBeVisible();
      await expect(page.getByTestId("activity-list")).toBeVisible();
      await settle(page);

      const boxes = await page.evaluate(() => {
        const rect = (selector: string) => {
          const box = document.querySelector<HTMLElement>(selector)?.getBoundingClientRect();
          return box ? { top: box.top, bottom: box.bottom, left: box.left, right: box.right } : null;
        };
        return {
          h1: rect("main h1"),
          health: rect('[data-testid="health-line"]'),
          inbox: rect('[data-testid="inbox-strip"]'),
          continue: rect('[data-testid="continue-list"]'),
          activity: rect('[data-testid="activity-list"]'),
        };
      });

      for (const [name, box] of Object.entries(boxes)) expect(box, `${name} at ${width}`).not.toBeNull();
      if (!boxes.h1 || !boxes.health || !boxes.inbox || !boxes.continue || !boxes.activity) return;

      // Reading order: title, health, proposals, continue, activity.
      expect(boxes.h1.top, `health under title at ${width}`).toBeLessThan(boxes.health.top);
      expect(boxes.health.top, `inbox under health at ${width}`).toBeLessThan(boxes.inbox.top);
      expect(boxes.inbox.top, `continue under inbox at ${width}`).toBeLessThan(boxes.continue.top);
      expect(boxes.continue.top, `activity under continue at ${width}`).toBeLessThan(boxes.activity.top);
      // One column: every block starts on the same left edge.
      expect(boxes.health.left, `health left at ${width}`).toBeCloseTo(boxes.inbox.left, 0);
      expect(boxes.continue.left, `continue left at ${width}`).toBeCloseTo(boxes.inbox.left, 0);
      expect(boxes.activity.left, `activity left at ${width}`).toBeCloseTo(boxes.inbox.left, 0);

      // The type counts and the layer chart are gone from Home.
      await expect(page.locator('[data-stat="tech"]')).toHaveCount(0);
      await expect(page.locator('[data-stat^="layer-"]')).toHaveCount(0);
    }
  } finally {
    restore();
  }
});

test("Continue tops up one local open with recently updated notes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 820 });
  // A single local open must not leave four empty rows: the list tops up from the vault.
  await page.goto("/notes/fastapi");
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  await page.goto("/");
  await expect(page.getByTestId("health-line")).toBeVisible();

  const rows = page.getByTestId("continue-list").locator("li");
  await expect(rows).toHaveCount(5);
  // The device's own open stays first.
  await expect(rows.first()).toContainText("FastAPI");
});

test("activity shows three plain rows and Show all expands in place", async ({ page }) => {
  const restore = seedActivity(6);
  try {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/");
    await expect(page.getByTestId("activity-list")).toBeVisible();

    const rows = page.getByTestId("activity-list").locator("li");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText("FastAPI");

    await page.getByRole("button", { name: /Show all \(6\)/ }).click();
    await expect(rows).toHaveCount(6);
    await expect(page.getByRole("button", { name: "Show less" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  } finally {
    restore();
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
    await expect(stat).toHaveClass(/text-destructive-text/);
    await expect(stat).toHaveAttribute("data-alert", "true");
    await expect(stat).toContainText(/broken link/);

    // Above zero the metric opens its details instead of linking to Explore.
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
        const marks = (await stat.getAttribute("class"))?.includes("text-destructive-text") ?? false;
        return count > 0 ? marks : !marks;
      })
      .toBe(true);
    if ((await brokenCount()) === 0) {
      // At zero it is plain text: no alarm, no link and no details trigger.
      await expect(stat).not.toHaveAttribute("data-alert", "true");
      await expect(stat).not.toHaveAttribute("href");
      await expect(page.getByRole("button", { name: /^Broken links:/ })).toHaveCount(0);
    }
  } finally {
    fs.rmSync(file, { force: true });
  }
});

test("creates the missing note from the broken links line", async ({ page }) => {
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

test("Home previews three proposals, clamps their reason and keeps Continue above the fold", async ({ page }) => {
  const ids = ["pending-1", "pending-2", "pending-3", "pending-4", "pending-5"];
  const longReason =
    "This reason is deliberately long enough to wrap several times on the Home card so the one line clamp is visible in a real layout.";
  for (const id of ids) writeProposal(id, `Proposal ${id}`, "Pending body.", id === "pending-1" ? longReason : "test");
  try {
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/");

    const strip = page.getByTestId("inbox-strip");
    await expect(strip).toBeVisible();
    await expect(strip.locator("[data-proposal-open]")).toHaveCount(3);
    await expect(strip.getByRole("link", { name: "Show all in Inbox (5)" })).toBeVisible();

    const reason = strip.locator("[data-proposal-reason]").first();
    const reasonBox = await reason.boundingBox();
    const lineHeight = await reason.evaluate((element) => Number.parseFloat(getComputedStyle(element).lineHeight));
    expect(reasonBox).not.toBeNull();
    expect(reasonBox?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(lineHeight * 1.75);

    const continueHeading = page.getByRole("heading", { name: "Continue where you left off" });
    const headingBox = await continueHeading.boundingBox();
    const listBox = await page.getByTestId("continue-list").boundingBox();
    expect(headingBox).not.toBeNull();
    expect(listBox).not.toBeNull();
    expect((headingBox?.y ?? Number.POSITIVE_INFINITY) + (headingBox?.height ?? 0)).toBeLessThan(820);
    expect(listBox?.y ?? Number.POSITIVE_INFINITY).toBeLessThan(820);
    console.log(
      `[home] 1280x820 continue=${headingBox?.y},${headingBox?.height} list=${listBox?.y} reason=${reasonBox?.width}x${reasonBox?.height} line=${lineHeight}`,
    );

    await strip.getByRole("link", { name: "Show all in Inbox (5)" }).click();
    await expect(page).toHaveURL(/\/inbox$/);
  } finally {
    for (const id of ids) {
      fs.rmSync(path.join(vaultPath(), "inbox", `${id}.md`), { force: true });
      fs.rmSync(path.join(vaultPath(), "tech", `${id}.md`), { force: true });
    }
  }
});
