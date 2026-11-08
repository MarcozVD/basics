import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { vaultPath } from "./helpers";

const written: string[] = [];

function write(relative: string, content: string): void {
  const file = path.join(vaultPath(), relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  written.push(file);
}

function created(): string {
  return `"${new Date().toISOString()}"`;
}

function writeCreateProposal(id: string): void {
  write(
    `inbox/${id}.md`,
    [
      "---",
      "type: tech",
      "kind: framework",
      `title: ${id}`,
      "layer: backend",
      "tags: []",
      "source: agent:e2e",
      "proposal:",
      "  action: create",
      "  proposed_by: e2e",
      "  reason: diff clarity",
      `  created: ${created()}`,
      "---",
      `# ${id}`,
      "",
      "A created note.",
      "",
    ].join("\n"),
  );
}

const UPDATE_FIELDS = [
  "type: tech",
  "kind: framework",
  "title: Diff update",
  "layer: backend",
  "description: old",
  "tags: [api]",
  "source: manual",
  "use_when:",
  "  - one",
  "  - two",
  "  - three",
  "  - four",
  "  - five",
  "  - six",
  "  - seven",
  "  - eight",
];

const BODY_LINES = Array.from({ length: 10 }, (_, index) => `line ${String(index + 1).padStart(2, "0")}`);

const BEFORE_BODY = ["# Diff update", "", "## Uno", "", "intro", "", ...BODY_LINES, ""].join("\n");
const AFTER_BODY = ["# Diff update", "", "## Uno", "", "intro", "", ...BODY_LINES, "", "## Errores", "", "new", ""].join("\n");

function writeUpdateProposal(id: string): void {
  const afterFields = [
    "type: tech",
    "kind: framework",
    "title: Diff update",
    "layer: backend",
    "description: new",
    "tags: [api, errors]",
    "source: manual",
    "use_when:",
    "  - one",
    "  - two",
    "  - three",
    "  - four",
    "  - five",
    "  - six",
    "  - seven",
    "  - EIGHT",
  ];
  write(`tech/${id}.md`, ["---", ...UPDATE_FIELDS, "---", "", BEFORE_BODY].join("\n"));
  write(
    `inbox/${id}.md`,
    [
      "---",
      ...afterFields,
      "proposal:",
      "  action: update",
      "  proposed_by: e2e",
      "  reason: diff clarity",
      `  created: ${created()}`,
      "---",
      "",
      AFTER_BODY,
    ].join("\n"),
  );
}

test.afterEach(() => {
  for (const file of written.splice(0)) fs.rmSync(file, { force: true });
});

test("a create proposal uses unified diff with no empty current column", async ({ page }) => {
  writeCreateProposal("diff-create");
  await page.goto("/inbox/diff-create");

  const diff = page.getByTestId("diff-view");
  await expect(diff).toBeVisible();
  await expect(diff).toHaveAttribute("data-mode", "unified");
  await expect(page.getByTestId("proposal-summary")).toHaveText("New tech note in Backend");
  await expect(diff.getByText("Current", { exact: true })).toHaveCount(0);
  await expect(diff.getByText("Side-by-side", { exact: true })).toHaveCount(0);
  await expect(diff.locator('[data-diff-mark="+"]').first()).toBeVisible();
  await expect(diff.locator('[data-diff-mark="-"]')).toHaveCount(0);
});

test("an update keeps context, its frontmatter key and both gutter glyphs", async ({ page }) => {
  writeUpdateProposal("diff-update");
  await page.goto("/inbox/diff-update");

  const diff = page.getByTestId("diff-view");
  await expect(diff).toBeVisible();
  await expect(diff).toHaveAttribute("data-mode", "split");
  await expect(page.getByTestId("proposal-summary")).toHaveText("Adds tag errors · Adds section Errores · Changes description · +1 more");

  // The changed frontmatter line sits behind folded context, but its key stays visible.
  await expect(diff.getByText("use_when:", { exact: true }).first()).toBeVisible();
  await expect(diff.locator('[data-diff-mark="+"]').first()).toBeVisible();
  await expect(diff.locator('[data-diff-mark="-"]').first()).toBeVisible();

  await expect(diff.getByText("line 01", { exact: true })).toHaveCount(0);
  const folds = diff.getByRole("button", { name: /unchanged lines/ });
  await expect(folds.first()).toBeVisible();
  await folds.last().click();
  await expect(diff.getByText("line 01", { exact: true }).first()).toBeVisible();
});

test("the proposal diff fills the page at 1440x900", async ({ page }) => {
  writeCreateProposal("diff-height");
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/inbox/diff-height");

  const diff = page.getByTestId("diff-view");
  await expect(diff).toBeVisible();
  const box = await diff.boundingBox();
  const bar = await page.getByRole("toolbar", { name: "Proposal actions" }).boundingBox();
  expect(box).not.toBeNull();
  expect(bar).not.toBeNull();
  if (!box || !bar) return;

  expect(box.height).toBeGreaterThan(500);
  const gap = bar.y - (box.y + box.height);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(80);
});
