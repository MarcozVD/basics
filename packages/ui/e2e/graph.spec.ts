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
  position: () => { x: number; y: number };
  boundingBox: (options: { includeLabels: boolean }) => CyBox;
  renderedBoundingBox: (options: { includeLabels: boolean }) => CyBox;
}

interface CyCollection {
  length: number;
  map: <T>(fn: (node: CyNodeHandle) => T) => T[];
  filter: (fn: (node: CyNodeHandle) => boolean) => CyCollection;
}

interface CyEdgeHandle {
  id: () => string;
  source: () => CyNodeHandle;
  target: () => CyNodeHandle;
  visible: () => boolean;
}

interface CyEdgeCollection {
  length: number;
  forEach: (fn: (edge: CyEdgeHandle) => void) => void;
}

interface CyHandle {
  getElementById: (id: string) => CyNodeHandle;
  nodes: (selector?: string) => CyCollection;
  edges: (selector?: string) => CyEdgeCollection;
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

interface GraphPerf {
  mounts: number;
  counters: Record<string, number>;
  lastSource: string | null;
}

/** The canvas's own timing record (published only for dev builds and the e2e probe). */
async function readPerf(page: Page): Promise<GraphPerf | null> {
  return page.evaluate(() => {
    const perf = (
      window as unknown as {
        __basicsGraphPerf?: { mounts: { source: string }[]; counters: Record<string, number> };
      }
    ).__basicsGraphPerf;
    if (!perf) return null;
    return {
      mounts: perf.mounts.length,
      counters: perf.counters,
      lastSource: perf.mounts[perf.mounts.length - 1]?.source ?? null,
    };
  });
}

/**
 * Positions of the nodes that carry them. Compound boxes are left out: their geometry
 * follows their members (and the label font, which may still be loading).
 */
async function readPositions(page: Page): Promise<Record<string, { x: number; y: number }> | null> {
  return page.evaluate(() => {
    const cy = (window as unknown as { __basicsCy?: CyHandle }).__basicsCy;
    if (!cy) return null;
    const seen = cy.nodes().filter((node) => !node.isParent());
    return Object.fromEntries(seen.map((node) => [node.id(), { x: node.position().x, y: node.position().y }]));
  });
}

/** Ids whose position moved more than half a pixel. */
function moved(before: Record<string, { x: number; y: number }>, after: Record<string, { x: number; y: number }>): string[] {
  return Object.keys(before).filter((id) => {
    const a = before[id];
    const b = after[id];
    return !b || Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5;
  });
}

/** Opens the graph and waits for the grouped picture (the first visit pays for the layout). */
async function openGraph(page: Page) {
  await page.goto("/graph");
  await expect(page.getByTestId("graph-canvas").locator("canvas").first()).toBeVisible();
  await expect.poll(async () => (await readGraph(page))?.fastapiParent).toBe("backend");
}

test("coming back to the graph re-attaches the canvas with the same positions, no layout", async ({ page }) => {
  await openGraph(page);
  const before = await readPositions(page);
  const perf = await readPerf(page);
  expect(before).not.toBeNull();
  expect(perf?.counters.layouts).toBeGreaterThan(0);

  await page.getByRole("link", { name: "Explore" }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await page.getByRole("link", { name: "Graph" }).click();
  await expect(page.getByTestId("graph-canvas").locator("canvas").first()).toBeVisible();

  // A second mount happened, and it did not lay the graph out again.
  await expect.poll(async () => (await readPerf(page))?.mounts).toBe((perf?.mounts ?? 0) + 1);
  await expect.poll(async () => (await readPerf(page))?.lastSource).toBe("cache");
  const returned = await readPerf(page);
  expect(returned?.counters.layouts).toBe(perf?.counters.layouts);
  expect(returned?.counters.reuses).toBe(1);

  const after = await readPositions(page);
  expect(after).not.toBeNull();
  expect(moved(before ?? {}, after ?? {})).toEqual([]);
});

test("reloading the graph restores the cached positions without running a layout", async ({ page }) => {
  await openGraph(page);
  const before = await readPositions(page);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("basics:graph-cache:v1") !== null)).toBe(true);

  await page.reload();
  await expect(page.getByTestId("graph-canvas").locator("canvas").first()).toBeVisible();
  await expect.poll(async () => (await readPerf(page))?.lastSource).toBe("cache");

  // The cached picture is placed as-is: no preset and no force layout on this load.
  const perf = await readPerf(page);
  expect(perf?.counters.layouts).toBe(0);
  expect(perf?.counters.cacheHits).toBe(1);

  const after = await readPositions(page);
  expect(moved(before ?? {}, after ?? {})).toEqual([]);
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

test("grouped mode hides edges to a node's own layer box", async ({ page }) => {
  await page.goto("/graph");
  // The preset layout is synchronous; polling also covers the first fit.
  await expect.poll(async () => (await readGraph(page))?.fastapiParent).toBe("backend");

  // Every edge joining a node to its own compound parent must be hidden in grouped mode.
  const grouped = await page.evaluate(() => {
    const cy = (window as unknown as { __basicsCy?: CyHandle }).__basicsCy;
    const intra: { id: string; visible: boolean }[] = [];
    let total = 0;
    cy?.edges().forEach((edge) => {
      total += 1;
      const source = edge.source();
      const target = edge.target();
      const isIntra =
        (target.isParent() && source.parent().id() === target.id()) || (source.isParent() && target.parent().id() === source.id());
      if (isIntra) intra.push({ id: edge.id(), visible: edge.visible() });
    });
    return { total, intra };
  });

  expect(grouped.total).toBeGreaterThan(0);
  // The vault has tech-in-layer edges, so the rule is actually exercised.
  expect(grouped.intra.length).toBeGreaterThan(0);
  expect(grouped.intra.filter((edge) => edge.visible)).toEqual([]);

  // Selecting the box lights its members instead of drawing the hidden edges.
  const boxPoint = await page.evaluate(() => {
    const cy = (window as unknown as { __basicsCy?: CyHandle }).__basicsCy;
    if (!cy) return null;
    const box = cy.getElementById("backend").renderedBoundingBox({ includeLabels: false });
    return { x: box.x1 + 30, y: box.y1 + 12 };
  });
  const canvas = page.getByTestId("graph-canvas");
  const origin = await canvas.boundingBox();
  if (!origin || !boxPoint) throw new Error("graph canvas has no geometry");
  await page.mouse.click(origin.x + boxPoint.x, origin.y + boxPoint.y);

  const litMembers = await page.evaluate(() => {
    const cy = (window as unknown as { __basicsCy?: CyHandle }).__basicsCy;
    const box = cy?.getElementById("backend");
    if (!cy || !box) return null;
    const members = cy.nodes(".lit").filter((node) => node.parent().id() === "backend");
    return members.length;
  });
  expect(litMembers).toBeGreaterThan(0);

  // Close the drawer before touching the toolbar (its backdrop covers it).
  await page.getByRole("dialog", { name: "Note details" }).getByRole("button", { name: "Close" }).click();

  // Flat mode keeps drawing the same edges (no compound parents, so they are plain links).
  await page.getByTestId("graph-group").getByRole("switch").click();
  await expect.poll(async () => (await readGraph(page))?.childCount).toBe(0);
  const flatVisible = await page.evaluate(
    (ids: string[]) => {
      const cy = (window as unknown as { __basicsCy?: CyHandle }).__basicsCy;
      return ids.every((id) => cy?.getElementById(id).visible() ?? false);
    },
    grouped.intra.map((edge) => edge.id),
  );
  expect(flatVisible).toBe(true);
});
