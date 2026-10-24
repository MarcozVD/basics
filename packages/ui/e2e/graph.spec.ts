import { expect, type Page, test } from "@playwright/test";

interface CyBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface CyNodeHandle {
  id: () => string;
  nonempty: () => boolean;
  isChild: () => boolean;
  isParent: () => boolean;
  parent: () => { id: () => string; nonempty: () => boolean };
  boundingBox: (options: { includeLabels: boolean }) => CyBox;
  renderedBoundingBox: (options: { includeLabels: boolean }) => CyBox;
}

interface CyCollection {
  length: number;
  map: <T>(fn: (node: CyNodeHandle) => T) => T[];
  filter: (fn: (node: CyNodeHandle) => boolean) => CyCollection;
}

interface CyHandle {
  getElementById: (id: string) => CyNodeHandle;
  nodes: (selector?: string) => CyCollection;
  zoom: () => number;
}

interface GraphState {
  fastapiParent: string;
  postgresqlParent: string;
  /** Layer boxes: their cytoscape geometry, labels excluded. */
  boxes: { id: string; box: CyBox }[];
  childCount: number;
  parentCount: number;
  zoom: number;
}

/** The canvas publishes its cytoscape instance only when a flag is set; e2e sets it. */
function readGraph(page: Page): Promise<GraphState | null> {
  return page.evaluate(() => {
    const cy = (window as unknown as { __basicsCy?: CyHandle }).__basicsCy;
    if (!cy) return null;
    const parentOf = (id: string) => {
      const node = cy.getElementById(id);
      if (!node.nonempty()) return "";
      const parent = node.parent();
      return parent.nonempty() ? parent.id() : "";
    };
    return {
      fastapiParent: parentOf("fastapi"),
      postgresqlParent: parentOf("postgresql"),
      boxes: cy.nodes(":parent").map((node) => ({ id: node.id(), box: node.boundingBox({ includeLabels: false }) })),
      childCount: cy.nodes().filter((node) => node.isChild()).length,
      parentCount: cy.nodes(":parent").length,
      zoom: cy.zoom(),
    };
  });
}

/** Pairs of boxes whose rectangles intersect. */
function overlaps(boxes: { id: string; box: CyBox }[]): string[] {
  const hits: string[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].box;
      const b = boxes[j].box;
      if (a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2) hits.push(`${boxes[i].id} / ${boxes[j].id}`);
    }
  }
  return hits;
}

test.beforeEach(async ({ page }) => {
  // Nothing in a normal build sets this flag, so the instance stays private in production.
  await page.addInitScript(() => {
    (window as unknown as { __BASICS_E2E__: boolean }).__BASICS_E2E__ = true;
  });
});

test("graph renders, search + Enter selects a node and the drawer opens its note", async ({ page }) => {
  await page.goto("/graph");

  const canvas = page.getByTestId("graph-canvas");
  await expect(canvas).toBeVisible();
  await expect(canvas.locator("canvas").first()).toBeVisible();
  await expect(page.getByTestId("graph-toolbar")).toBeVisible();

  await page.getByTestId("graph-search").fill("fastapi");
  await page.getByTestId("graph-search").press("Enter");

  const drawer = page.getByRole("dialog", { name: "Note details" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "FastAPI" })).toBeVisible();

  await page.getByTestId("graph-open-note").click();
  await expect(page).toHaveURL(/\/notes\/fastapi$/);
});

test("grouped graph boxes its layers on a grid and the switch flattens it", async ({ page }) => {
  await page.goto("/graph");

  const canvas = page.getByTestId("graph-canvas");
  await expect(canvas.locator("canvas").first()).toBeVisible();
  await expect(page.getByTestId("graph-group").getByRole("switch")).toHaveAttribute("aria-checked", "true");

  // The preset layout is synchronous; polling also covers the first fit.
  await expect.poll(async () => (await readGraph(page))?.fastapiParent).toBe("backend");
  const state = await readGraph(page);
  expect(state).not.toBeNull();
  const grouped = state as GraphState;

  // Each tech lives inside the box of its own layer.
  expect(grouped.fastapiParent).toBe("backend");
  expect(grouped.postgresqlParent).toBe("data");
  expect(grouped.parentCount).toBeGreaterThan(1);
  expect(grouped.childCount).toBeGreaterThan(grouped.parentCount);

  // Boxes sit on a grid: no two layer rectangles intersect.
  expect(overlaps(grouped.boxes)).toEqual([]);

  // Clicking the box header (empty padding, away from the members) selects the layer note.
  const point = await page.evaluate(() => {
    const cy = (window as unknown as { __basicsCy?: CyHandle }).__basicsCy;
    if (!cy) return null;
    const box = cy.getElementById("backend").renderedBoundingBox({ includeLabels: false });
    return { x: box.x1 + 30, y: box.y1 + 12 };
  });
  expect(point).not.toBeNull();
  const origin = await canvas.boundingBox();
  if (!origin || !point) throw new Error("graph canvas has no geometry");
  await page.mouse.click(origin.x + point.x, origin.y + point.y);

  const drawer = page.getByRole("dialog", { name: "Note details" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "Backend" })).toBeVisible();

  // The drawer's backdrop covers the toolbar while it is open.
  await drawer.getByRole("button", { name: "Close" }).click();
  await expect(drawer).toBeHidden();

  // Switching grouping off drops every compound parent.
  await page.getByTestId("graph-group").getByRole("switch").click();
  await expect(page.getByTestId("graph-group").getByRole("switch")).toHaveAttribute("aria-checked", "false");
  await expect.poll(async () => (await readGraph(page))?.childCount).toBe(0);
  const flat = await readGraph(page);
  expect(flat?.parentCount).toBe(0);
  expect(flat?.fastapiParent).toBe("");
  expect(await page.evaluate(() => localStorage.getItem("basics:graph-group"))).toBe("0");
});
