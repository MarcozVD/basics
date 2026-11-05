import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
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
  pan: () => { x: number; y: number };
  viewport: (viewport: { zoom: number; pan: { x: number; y: number } }) => void;
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
  /** The last mount, as the graph page recorded it. */
  last: {
    nodes: number;
    firstFrameAt: number | null;
    settledAt: number | null;
    source: string;
  } | null;
}

/** The canvas's own timing record (published only for dev builds and the e2e probe). */
async function readPerf(page: Page): Promise<GraphPerf | null> {
  return page.evaluate(() => {
    const perf = (
      window as unknown as {
        __basicsGraphPerf?: {
          mounts: { nodes: number; firstFrameAt: number | null; settledAt: number | null; source: string }[];
          counters: Record<string, number>;
        };
      }
    ).__basicsGraphPerf;
    if (!perf) return null;
    const last = perf.mounts[perf.mounts.length - 1] ?? null;
    return {
      mounts: perf.mounts.length,
      counters: perf.counters,
      lastSource: last?.source ?? null,
      last: last ? { nodes: last.nodes, firstFrameAt: last.firstFrameAt, settledAt: last.settledAt, source: last.source } : null,
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

/** Most non-transparent pixels any canvas layer paints. */
async function paintedPixels(page: Page): Promise<number> {
  return page.evaluate(async () => {
    const canvases = Array.from(document.querySelectorAll('[data-testid="graph-canvas"] canvas')) as HTMLCanvasElement[];
    let best = 0;
    for (const canvas of canvases) {
      const image = new Image();
      image.src = canvas.toDataURL();
      await image.decode();
      const copy = document.createElement("canvas");
      copy.width = image.width;
      copy.height = image.height;
      const context = copy.getContext("2d");
      if (!context) continue;
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, copy.width, copy.height).data;
      let painted = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted += 1;
      if (painted > best) best = painted;
    }
    return best;
  });
}

/** Cheap fingerprint of what the canvas layers currently paint. */
async function canvasSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('[data-testid="graph-canvas"] canvas')) as HTMLCanvasElement[];
    return canvases
      .map((canvas) => {
        const url = canvas.toDataURL();
        let hash = 0;
        for (let i = 0; i < url.length; i++) hash = (Math.imul(hash, 31) + url.charCodeAt(i)) | 0;
        return `${canvas.width}x${canvas.height}:${hash}`;
      })
      .join("|");
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

  // The kept canvas must still be alive. Detaching the cytoscape container used to destroy
  // its renderer, so the picture froze: a zoom or a resize never painted again.
  expect(await paintedPixels(page)).toBeGreaterThan(0);
  const paintedBefore = await canvasSignature(page);
  await page.evaluate(() => {
    const cy = (window as unknown as { __basicsCy?: CyHandle }).__basicsCy;
    if (cy) cy.viewport({ zoom: cy.zoom() * 1.8, pan: cy.pan() });
  });
  await expect.poll(() => canvasSignature(page), { timeout: 10_000 }).not.toBe(paintedBefore);
  expect(await paintedPixels(page)).toBeGreaterThan(0);
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

/**
 * The big-vault specs run against their own server: a generated vault where the flat
 * force layout takes seconds, so "while the layout runs" is a real window to test in.
 */
const LARGE_PORT = 4813;
const LARGE_STATE = ".vault-path-large";
const HERE = import.meta.dirname;

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (res.ok) return;
    } catch {
      // Server not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`graph e2e server on ${port} did not start`);
}

test.describe("large vault", () => {
  test.use({ baseURL: `http://127.0.0.1:${LARGE_PORT}` });
  // A cold page load of a 860-node vault plus a full layout takes a while.
  test.setTimeout(240_000);

  let server: ChildProcess | undefined;

  test.beforeAll(async () => {
    server = spawn(process.execPath, ["e2e/serve.mjs"], {
      cwd: path.resolve(HERE, ".."),
      env: {
        ...process.env,
        BASICS_E2E_GENERATED: "600",
        BASICS_E2E_PORT: String(LARGE_PORT),
        BASICS_E2E_STATE: LARGE_STATE,
      },
      stdio: "ignore",
    });
    await waitForHealth(LARGE_PORT);
  });

  test.afterAll(async () => {
    const child = server;
    if (!child || child.exitCode !== null) return;
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill();
    });
  });

  test.beforeEach(async ({ page }) => {
    // Flat: the force layout, the case the worker exists for.
    await page.addInitScript(() => localStorage.setItem("basics:graph-group", "0"));
  });

  test("a node opens its panel while the cold layout is still running", async ({ page }) => {
    await page.goto("/graph");
    // A cold load of 860 nodes takes the app server-side work before the canvas exists.
    await expect(page.getByTestId("graph-canvas").locator("canvas").first()).toBeVisible({ timeout: 120_000 });

    // The seeded picture is painted while the simulation is still in the worker.
    await expect.poll(async () => (await readPerf(page))?.last?.firstFrameAt ?? null, { timeout: 120_000 }).not.toBeNull();
    const before = await readPerf(page);
    expect(before?.last?.nodes).toBeGreaterThan(500);
    expect(before?.last?.settledAt).toBeNull();

    // tech-0 is the best connected node, so the spiral seeds put it in the middle.
    const point = await page.evaluate(() => {
      const cy = (window as unknown as { __basicsCy?: CyHandle }).__basicsCy;
      if (!cy) return null;
      const node = cy.getElementById("tech-0");
      if (!node.nonempty()) return null;
      const box = node.renderedBoundingBox({ includeLabels: false });
      return { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
    });
    expect(point).not.toBeNull();
    const origin = await page.getByTestId("graph-canvas").boundingBox();
    if (!origin || !point) throw new Error("graph canvas has no geometry");
    // The seeds are fitted, so the node must be on screen before the simulation moves it.
    expect(point.x).toBeGreaterThan(0);
    expect(point.y).toBeGreaterThan(0);
    expect(point.x).toBeLessThan(origin.width);
    expect(point.y).toBeLessThan(origin.height);

    // A real mouse click on the canvas: it only lands if the main thread is free.
    const clickedAt = Date.now();
    await page.mouse.click(origin.x + point.x, origin.y + point.y);
    const drawer = page.getByRole("dialog", { name: "Note details" });
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    await expect(drawer.getByRole("heading", { name: "Tech 0" })).toBeVisible();
    expect(Date.now() - clickedAt).toBeLessThan(10_000);

    // The layout was still mid-flight when the drawer opened.
    const during = await readPerf(page);
    expect(during?.counters.workers).toBe(0);
    expect(during?.counters.fallbacks).toBe(0);

    // And it does settle afterwards, in the worker, moving nodes into place.
    await expect.poll(async () => (await readPerf(page))?.last?.settledAt ?? null, { timeout: 180_000 }).not.toBeNull();
    const after = await readPerf(page);
    expect(after?.counters.workers).toBe(1);
    expect(after?.counters.fallbacks).toBe(0);
    // Normal motion glides into the settled picture.
    expect(after?.counters.glides).toBeGreaterThan(0);
  });

  test("reduced motion jumps to the settled positions instead of gliding", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/graph");
    await expect(page.getByTestId("graph-canvas").locator("canvas").first()).toBeVisible({ timeout: 120_000 });
    await expect.poll(async () => (await readPerf(page))?.last?.settledAt ?? null, { timeout: 180_000 }).not.toBeNull();

    const perf = await readPerf(page);
    expect(perf?.last?.source).toBe("layout");
    expect(perf?.counters.workers).toBe(1);
    // No intermediate picture and no glide: the nodes were put where they belong.
    expect(perf?.counters.glides).toBe(0);
  });
});
