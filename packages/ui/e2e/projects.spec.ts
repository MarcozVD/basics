import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { vaultPath } from "./helpers";

interface ProjectSeed {
  id: string;
  title: string;
  status: "active" | "paused" | "archived";
  path?: string;
  profile?: string;
  stack?: Record<string, string[]>;
  reason?: string;
  lessons?: string[];
  last_checks?: Record<string, { status: string; at: string; duration_ms?: number; output_tail?: string }>;
}

function writeProject(seed: ProjectSeed) {
  const file = path.join(vaultPath(), "projects", `${seed.id}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const stack = seed.stack ?? {};
  const data: string[] = [
    "---",
    "type: project",
    `title: ${seed.title}`,
    `status: ${seed.status}`,
    seed.path ? `path: "${seed.path}"` : null,
    seed.profile ? `profile: ${seed.profile}` : null,
    ...(Object.keys(stack).length > 0
      ? ["stack:", ...Object.entries(stack).flatMap(([layer, techs]) => [`  ${layer}: [${techs.join(", ")}]`])]
      : []),
    `reason: "${seed.reason ?? ""}"`,
    `lessons: [${(seed.lessons ?? []).map((l) => `"${l}"`).join(", ")}]`,
  ].filter((line): line is string => line !== null);
  if (seed.last_checks) {
    data.push("last_checks:");
    for (const [id, check] of Object.entries(seed.last_checks)) {
      data.push(`  ${id}:`);
      data.push(`    status: ${check.status}`);
      data.push(`    at: "${check.at}"`);
      if (check.duration_ms !== undefined) data.push(`    duration_ms: ${check.duration_ms}`);
      if (check.output_tail) data.push(`    output_tail: "${check.output_tail}"`);
    }
  }
  data.push("---");
  data.push(`# ${seed.title}`);
  data.push("");
  fs.writeFileSync(file, data.join("\n"));
}

test.afterEach(() => {
  // The specs share one temp vault; remove each file so the file watcher sees the
  // unlinks (deleting the directory would break chokidar tracking for later tests).
  const dir = path.join(vaultPath(), "projects");
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    fs.rmSync(path.join(dir, entry), { force: true });
  }
});

test("lists projects, filters by status and selects with ↓ showing stack and checks", async ({ page }) => {
  writeProject({
    id: "alpha-api",
    title: "Alpha API",
    status: "active",
    path: "/home/me/code/alpha",
    profile: "ml-api",
    stack: { backend: ["fastapi"], testing: ["pytest"] },
    reason: "Expose the model behind a typed REST API.",
    lessons: ["Load the model once at startup"],
    last_checks: {
      "fastapi-endpoint-tests": {
        status: "pass",
        at: "2026-10-20T09:00:00.000Z",
        duration_ms: 312,
        output_tail: "2 passed, 0 failed",
      },
    },
  });
  writeProject({
    id: "beta-web",
    title: "Beta Web",
    status: "paused",
    path: "/home/me/code/beta",
    stack: { frontend: ["react", "typescript"] },
    reason: "Marketing site on hold.",
  });

  await page.goto("/projects");

  // Both projects listed.
  const rows = page.getByRole("option");
  await expect(rows).toHaveCount(2);

  // Default selection is the first row (updated-first) and the URL carries ?p=.
  await expect(page).toHaveURL(/\/projects\?p=alpha-api$/);
  await expect(page.locator("#project-row-0")).toHaveAttribute("aria-selected", "true");

  // ↓ moves the selection to the second project.
  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/projects\?p=beta-web$/);
  await expect(page.locator("#project-row-1")).toHaveAttribute("aria-selected", "true");

  // Filter to Active: only Alpha remains, clamped back to the first row.
  await page.getByRole("tab", { name: /Active/ }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Alpha API");
  await expect(page).toHaveURL(/\/projects\?p=alpha-api$/);

  // Detail shows the stack and the checks table.
  await expect(page.getByRole("heading", { name: "Alpha API", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "fastapi", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "pytest", exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Check" })).toBeVisible();
  await expect(page.getByText("fastapi-endpoint-tests", { exact: true })).toBeVisible();
  // The output is inside a collapsible `<details>`; expand it to inspect the excerpt.
  await page.getByText("Show output", { exact: true }).click();
  await expect(page.getByText("2 passed, 0 failed", { exact: true })).toBeVisible();

  // Export opens the shared modal with this project's stack.
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Export", exact: true })).toBeVisible();
  await expect(dialog).toContainText("basics export --stack fastapi,pytest");
  await expect(dialog).toContainText("FastAPI");
});

test("hover over the last row does not scroll the list", async ({ page }) => {
  // Seed enough projects so the list column scrolls.
  for (let i = 1; i <= 20; i++) {
    writeProject({ id: `proj-${String(i).padStart(2, "0")}`, title: `Project ${i}`, status: "active" });
  }

  await page.goto("/projects");
  await expect(page.getByRole("option").first()).toBeVisible();

  const list = page.getByRole("listbox", { name: "Projects" });
  const last = page.getByRole("option").last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeVisible();

  // Let the list settle after scrolling (the selection highlight animates with
  // motion and can shift the layout by a fraction of a pixel while it runs).
  await page.waitForTimeout(300);

  // Normalize to an integer scroll offset so browser pixel rounding can't
  // produce a noisy 1px diff unrelated to real auto-scroll.
  const before = await list.evaluate((element) => (element.scrollTop = Math.round(element.scrollTop)));
  expect(before).toBeGreaterThan(0);

  const box = await last.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.waitForTimeout(150);
  // Same integer normalisation as `before`: the check is that hover did not
  // change the scroll position.
  const after = await list.evaluate((element) => Math.round(element.scrollTop));
  expect(after).toBe(before);
});
