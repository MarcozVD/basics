import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { vaultPath } from "./helpers";

// Regression coverage for F5 stage 1: the editor sidebar scrolls, so a dropdown
// panel rendered inside it would be clipped. Panels are portalled to the body
// and must stay fully inside the viewport, with their own scroll.

function writeProject(id: string, title: string, stack: Record<string, string[]> = {}) {
  const file = path.join(vaultPath(), "projects", `${id}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const data = [
    "---",
    "type: project",
    `title: ${title}`,
    "status: active",
    ...(Object.keys(stack).length > 0
      ? ["stack:", ...Object.entries(stack).flatMap(([layer, techs]) => [`  ${layer}: [${techs.join(", ")}]`])]
      : []),
    "---",
    `# ${title}`,
    "",
  ];
  fs.writeFileSync(file, data.join("\n"));
}

test.afterEach(() => {
  fs.rmSync(path.join(vaultPath(), "projects", "gamma-app.md"), { force: true });
});

/** The panel must be fully inside the viewport and hit-testable at its centre. */
async function expectInsideViewport(page: import("@playwright/test").Page, selector: string) {
  const panel = page.locator(selector);
  await expect(panel).toBeVisible();
  // Let the unfold spring and the height animation settle before measuring.
  await page.waitForTimeout(450);
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 0.5);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 0.5);

  const centre = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  const hit = await page.evaluate(({ x, y }) => {
    const element = document.elementFromPoint(x, y);
    return element ? Boolean(element.closest("[role='listbox']")) : false;
  }, centre);
  expect(hit).toBe(true);
  return box!;
}

test("add-layer pills add a row and dropdowns are never clipped by the sidebar", async ({ page }) => {
  writeProject("gamma-app", "Gamma App", { backend: ["fastapi"] });
  // 800px tall keeps the sidebar itself scrollable, the exact case the bug
  // report describes: a panel inside `overflow-y-auto` used to be clipped.
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/notes/gamma-app");

  // The sidebar is the scrolling column from 1280px.
  const aside = page.locator("aside");
  await expect(aside).toBeVisible();

  // One pill per remaining layer; a click adds the row and focuses its search.
  const frontendInput = page.getByLabel("Stack Frontend");
  await expect(frontendInput).toHaveCount(0);
  await page.getByRole("button", { name: "Add Frontend layer" }).click();
  await expect(frontendInput).toBeVisible();
  await expect(frontendInput).toBeFocused();

  // Park the stack field at the bottom of the sidebar, the worst case for a
  // panel that would open downwards.
  await page.getByLabel("Stack Backend").evaluate((element) => element.scrollIntoView({ block: "end" }));
  await page.waitForTimeout(200);

  // Stack MultiSelect: portalled, flipped and fully inside the viewport.
  await page.getByLabel("Stack Backend").click();
  const multiSelect = page.locator("[data-multi-select-content]:not([aria-hidden='true'])");
  await expect(multiSelect).toBeVisible();
  await expectInsideViewport(page, "[data-multi-select-content]:not([aria-hidden='true']) [role='listbox']");
  // The panel lives in the body, not inside the clipping sidebar.
  expect(await multiSelect.evaluate((element) => Boolean(element.closest("aside")))).toBe(false);

  await page.keyboard.press("Escape");
  await expect(multiSelect).toHaveCount(0);

  // Enum Select (Status) in the same sidebar: same guarantees.
  const status = aside.getByRole("button", { name: "Active", exact: true });
  await status.evaluate((element) => element.scrollIntoView({ block: "end" }));
  await page.waitForTimeout(200);
  await status.click();
  const selectPanel = page.locator("[data-select-content]:not([aria-hidden='true'])");
  await expect(selectPanel).toBeVisible();
  await expectInsideViewport(page, "[data-select-content]:not([aria-hidden='true'])");
  expect(await selectPanel.evaluate((element) => Boolean(element.closest("aside")))).toBe(false);

  // Picking an option still works through the portalled panel, and focus
  // returns to the trigger.
  await page.getByRole("option", { name: "Paused", exact: true }).click();
  const paused = aside.getByRole("button", { name: "Paused", exact: true });
  await expect(paused).toBeVisible();
  await expect(paused).toBeFocused();
});
