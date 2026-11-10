import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

// Keep frame-gap sampling independent of headless-window occlusion on Windows.
test.use({
  launchOptions: {
    args: [
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-features=CalculateNativeWinOcclusion",
    ],
  },
});

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
  data: (key: string) => unknown;
  style: (key: string) => string;
  width: () => number;
  renderedWidth: () => number;
  locked: () => boolean;
  selectable: () => boolean;
  grabbable: () => boolean;
  emit: (event: string) => void;
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
  batching: () => boolean;
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

/** Nodes marked hidden by the toolbar's type filter. */
async function goneCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const cy = (window as unknown as { __basicsCy?: CyHandle }).__basicsCy;
    return cy ? cy.nodes(".gone").length : -1;
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

/** Wait for this switch's mount, including its selection/hover refresh after element sync. */
async function switchGraph(page: Page, action: () => Promise<unknown>): Promise<void> {
  const before = await page.evaluate(() => {
    const perf = (window as unknown as { __basicsGraphPerf: { mounts: unknown[] } }).__basicsGraphPerf;
    return { mounts: perf.mounts.length, start: performance.now() };
  });
  await action();
  await page.waitForFunction(({ mounts, start }) => {
    const perf = (
      window as unknown as {
        __basicsGraphPerf: { mounts: { settledAt: number | null; phases: Record<string, number> }[] };
      }
    ).__basicsGraphPerf;
    const last = perf.mounts.at(-1);
    return perf.mounts.length > mounts && (last?.settledAt ?? 0) >= start && last?.phases.selection !== undefined;
  }, before);
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

test("clicking Graph while already on Graph never freezes the canvas", async ({ page }) => {
  await page.goto("/graph");
  const graphLink = page.getByTestId("sidebar").getByRole("link", { name: "Graph", exact: true });

  // A same-pathname click during boot pushes a new history key without changing the route. It
  // must not invalidate the canvas this page is about to paint.
  await graphLink.click();
  await expect(page.getByTestId("graph-canvas").locator("canvas").first()).toBeVisible();
  await expect.poll(async () => (await readGraph(page))?.fastapiParent).toBe("backend");

  // A second same-pathname click after the boot settled keeps the mounted canvas alive.
  await graphLink.click();
  await expect.poll(async () => (await readGraph(page))?.fastapiParent).toBe("backend");

  // And the canvas still reacts to a filter: hiding a type marks its nodes gone.
  const before = await goneCount(page);
  await page.getByTestId("graph-type-tech").click();
  await expect.poll(() => goneCount(page)).toBeGreaterThan(before);
});

test("reloading the graph restores the cached positions without running a layout", async ({ page }) => {
  await openGraph(page);
  const before = await readPositions(page);
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem("basics:graph-cache:v2") !== null)).toBe(true);

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

test("free graph puts profiles/projects inside tech, practices and checks in stable bands", async ({ page }) => {
  const project = await page.request.post("/api/notes", {
    data: {
      id: "ring-project",
      data: { type: "project", title: "Ring project", status: "active", stack: { backend: ["fastapi"] } },
      body: "",
    },
  });
  expect(project.ok()).toBe(true);
  try {
    await page.addInitScript(() => localStorage.setItem("basics:graph-group", "0"));
    await page.goto("/graph");
    await expect(page.getByTestId("graph-canvas").locator("canvas").first()).toBeVisible();
    await expect.poll(async () => (await readPerf(page))?.last?.settledAt ?? null).not.toBeNull();
    const radii = await page.evaluate(() => {
      const cy = (window as unknown as { __basicsCy: CyHandle }).__basicsCy;
      return Object.fromEntries(
        ["profile", "project", "tech", "practice", "check", "layer"].map((type) => [
          type,
          cy.nodes(`[type = "${type}"]`).map((n) => Math.hypot(n.position().x, n.position().y)),
        ]),
      );
    });
    for (const type of ["profile", "project", "tech", "practice", "check"]) expect(radii[type].length).toBeGreaterThan(0);
    expect(Math.max(...radii.profile, ...radii.project)).toBeLessThan(Math.min(...radii.tech));
    expect(Math.max(...radii.tech)).toBeLessThan(Math.min(...radii.practice));
    expect(Math.max(...radii.practice)).toBeLessThan(Math.min(...radii.check));
    expect(Math.max(...radii.check)).toBeLessThan(Math.min(...radii.layer));
    const before = await readPositions(page);
    // A fresh load must reproduce the layout without relying on the position cache.
    await page.evaluate(() => sessionStorage.clear());
    await page.reload();
    await expect.poll(async () => (await readPerf(page))?.last?.settledAt ?? null).not.toBeNull();
    expect(moved(before!, (await readPositions(page))!)).toEqual([]);
    expect((await readPerf(page))?.counters.fcose).toBe(0);
  } finally {
    await page.request.delete("/api/notes/ring-project");
  }
});

for (const theme of ["light", "dark"]) {
  test(`free graph has quiet, noninteractive ring guides in ${theme} theme`, async ({ page }) => {
    await page.addInitScript((theme) => {
      localStorage.setItem("basics:graph-group", "0");
      localStorage.setItem("basics-theme", theme);
    }, theme);
    await page.goto("/graph");
    await expect.poll(async () => (await readPerf(page))?.last?.settledAt ?? null).not.toBeNull();
    const guides = await page.evaluate(() => {
      const cy = (window as unknown as { __basicsCy: CyHandle }).__basicsCy;
      const token = getComputedStyle(document.documentElement).getPropertyValue("--foreground").trim();
      const sample = document.createElement("span");
      sample.style.color = token;
      document.body.append(sample);
      const foreground = getComputedStyle(sample).color;
      sample.remove();
      return cy.nodes("[ringGuide]").map((guide) => ({
        id: guide.id(),
        position: guide.position(),
        radius: guide.width() / 2,
        memberRadii: (guide.data("members") as string[]).map((id) => {
          const p = cy.getElementById(id).position();
          return Math.hypot(p.x, p.y);
        }),
        events: guide.style("events"),
        background: Number(guide.style("background-opacity")),
        borderWidth: Number.parseFloat(guide.style("border-width")),
        borderOpacity: Number(guide.style("border-opacity")),
        color: guide.style("border-color"),
        foreground,
        depth: guide.style("z-compound-depth"),
        zIndex: Number(guide.style("z-index")),
        locked: guide.locked(),
        selectable: guide.selectable(),
        grabbable: guide.grabbable(),
      }));
    });
    expect(guides).toHaveLength(5);
    for (const guide of guides) {
      expect(guide.position).toEqual({ x: 0, y: 0 });
      expect(guide.memberRadii.length).toBeGreaterThan(0);
      for (const radius of guide.memberRadii) expect(radius).toBeLessThanOrEqual(guide.radius + 0.1);
      expect(Math.max(...guide.memberRadii)).toBeCloseTo(guide.radius, 1);
      expect(guide.events).toBe("no");
      expect(guide.background).toBe(0);
      expect(guide.borderWidth).toBe(1.5);
      expect(guide.borderOpacity).toBe(0.12);
      expect(guide.color.replace(/\s/g, "")).toBe(guide.foreground.replace(/\s/g, ""));
      expect(guide.depth).toBe("bottom");
      expect(guide.zIndex).toBeLessThan(0);
      expect(guide.locked).toBe(true);
      expect(guide.selectable).toBe(false);
      expect(guide.grabbable).toBe(false);
    }
    const scaling = await page.evaluate(() => {
      const cy = (window as unknown as { __basicsCy: CyHandle }).__basicsCy;
      const guide = cy.nodes("[ringGuide]").map((node) => node)[0];
      const before = guide.renderedWidth();
      const pan = cy.pan();
      cy.viewport({ zoom: cy.zoom() * 1.25, pan: { x: pan.x + 20, y: pan.y + 15 } });
      return { before, after: guide.renderedWidth(), position: guide.position() };
    });
    expect(scaling.after / scaling.before).toBeCloseTo(1.25);
    expect(scaling.position).toEqual({ x: 0, y: 0 });
    expect((await readPerf(page))?.counters.layouts).toBe(1);
    await page.getByTestId("graph-group").getByRole("switch").click();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __basicsCy: CyHandle }).__basicsCy.nodes("[ringGuide]").length))
      .toBe(0);
    await page.goto("/notes/fastapi");
    await expect(page.getByTestId("local-graph-canvas").locator("canvas").first()).toBeVisible();
    await expect.poll(async () => (await readPerf(page))?.last?.settledAt ?? null).not.toBeNull();
    expect(await page.evaluate(() => (window as unknown as { __basicsCy: CyHandle }).__basicsCy.nodes("[ringGuide]").length)).toBe(0);
  });
}

test("toggles reuse each mode's camera and renderer without stale hover, filters or search", async ({ page }) => {
  await openGraph(page);
  const practiceCount = await page.evaluate(
    () => (window as unknown as { __basicsCy: CyHandle }).__basicsCy.nodes('[type = "practice"]').length,
  );
  expect(practiceCount).toBeGreaterThan(0);
  await page.evaluate(() => {
    const win = window as unknown as { __basicsCy: CyHandle; __groupedCy?: CyHandle };
    win.__groupedCy = win.__basicsCy;
    win.__basicsCy.viewport({ zoom: 0.7, pan: { x: 80, y: 90 } });
    win.__basicsCy.getElementById("fastapi").emit("mouseover");
  });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __basicsCy: CyHandle }).__basicsCy.nodes(".lit").length))
    .toBeGreaterThan(0);
  const toggle = page.getByTestId("graph-group").getByRole("switch");
  await toggle.focus();
  await switchGraph(page, () => toggle.press("Space"));
  await expect.poll(async () => (await readGraph(page))?.fastapiParent).toBe("");
  await page.evaluate(() => {
    const win = window as unknown as { __basicsCy: CyHandle; __freeCy?: CyHandle };
    win.__freeCy = win.__basicsCy;
    win.__basicsCy.viewport({ zoom: 0.8, pan: { x: 110, y: 120 } });
  });
  await switchGraph(page, () => toggle.press("Space"));
  await expect.poll(async () => (await readGraph(page))?.fastapiParent).toBe("backend");
  expect(
    await page.evaluate(() => {
      const win = window as unknown as { __basicsCy: CyHandle; __groupedCy: CyHandle; __freeCy: CyHandle };
      return {
        same: win.__basicsCy === win.__groupedCy,
        activePaused: win.__basicsCy.batching(),
        inactivePaused: win.__freeCy.batching(),
        zoom: win.__basicsCy.zoom(),
        pan: win.__basicsCy.pan(),
        lit: win.__basicsCy.nodes(".lit").length,
        faded: win.__basicsCy.nodes(".fade").length,
      };
    }),
  ).toEqual({ same: true, activePaused: false, inactivePaused: true, zoom: 0.7, pan: { x: 80, y: 90 }, lit: 0, faded: 0 });
  await page.getByTestId("graph-search").fill("fastapi");
  await page.getByTestId("graph-type-practice").click();
  await switchGraph(page, () => toggle.click());
  await expect.poll(async () => (await readGraph(page))?.fastapiParent).toBe("");
  expect(
    await page.evaluate(() => {
      const win = window as unknown as { __basicsCy: CyHandle; __freeCy: CyHandle; __groupedCy: CyHandle };
      return {
        same: win.__basicsCy === win.__freeCy,
        activePaused: win.__basicsCy.batching(),
        inactivePaused: win.__groupedCy.batching(),
        zoom: win.__basicsCy.zoom(),
        pan: win.__basicsCy.pan(),
        hits: win.__basicsCy
          .nodes(".hit")
          .map((n) => n.id())
          .sort(),
        hidden: win.__basicsCy.nodes('[type = "practice"].gone').length,
        staleGrouped: win.__basicsCy.nodes("[grouped]").length,
      };
    }),
  ).toEqual({
    same: true,
    activePaused: false,
    inactivePaused: true,
    zoom: 0.8,
    pan: { x: 110, y: 120 },
    hits: ["fastapi", "fastapi-endpoint-tests", "fastapi-structure"],
    hidden: practiceCount,
    staleGrouped: 0,
  });
  expect((await readPerf(page))?.counters.layouts).toBe(2);
});

test("retained views cancel pending hover on every switch", async ({ page }) => {
  await openGraph(page);
  await page.mouse.move(0, 0);
  // Visit both views repeatedly: the original mount's handlers used to outlive its cleanup.
  for (let visit = 0; visit < 6; visit++) {
    await switchGraph(page, () =>
      page.evaluate(() => {
        const win = window as unknown as { __basicsCy: CyHandle; __leavingCy?: CyHandle };
        const cy = win.__basicsCy;
        win.__leavingCy = cy;
        // Queue hover and leave in the same task, before its animation frame can run.
        cy.getElementById("fastapi").emit("mouseover");
        document.querySelector<HTMLButtonElement>('[data-testid="graph-group"] [role="switch"]')!.click();
      }),
    );
    // Let any uncancelled frame run, then inspect both the active and detached views.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(
      await page.evaluate(() => {
        const win = window as unknown as { __basicsCy: CyHandle; __leavingCy: CyHandle };
        return [win.__basicsCy, win.__leavingCy].map((cy) => ({ lit: cy.nodes(".lit").length, faded: cy.nodes(".fade").length }));
      }),
    ).toEqual([
      { lit: 0, faded: 0 },
      { lit: 0, faded: 0 },
    ]);
  }
});

test("returning to a retained mode applies vault and theme changes made in the other mode", async ({ page }) => {
  await openGraph(page);
  const toggle = page.getByTestId("graph-group").getByRole("switch");
  await toggle.click();
  await expect.poll(async () => (await readGraph(page))?.fastapiParent).toBe("");
  const created = await page.request.post("/api/notes", {
    data: { id: "toggle-added", data: { type: "tech", kind: "framework", title: "Toggle added", layer: "backend" }, body: "" },
  });
  expect(created.ok()).toBe(true);
  try {
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { __basicsCy: CyHandle }).__basicsCy.getElementById("toggle-added").nonempty()))
      .toBe(true);
    await toggle.click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const note = (window as unknown as { __basicsCy: CyHandle }).__basicsCy.getElementById("toggle-added");
          return note.nonempty() ? note.parent().id() : "";
        }),
      )
      .toBe("backend");
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await toggle.click();
    await expect.poll(async () => (await readGraph(page))?.fastapiParent).toBe("");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const cy = (window as unknown as { __basicsCy: CyHandle }).__basicsCy;
          const sample = document.createElement("span");
          sample.style.color = getComputedStyle(document.documentElement).getPropertyValue("--foreground");
          document.body.append(sample);
          const expected = getComputedStyle(sample).color.replace(/\s/g, "");
          sample.remove();
          return cy
            .nodes("[ringGuide]")
            .map((n) => n.style("border-color").replace(/\s/g, ""))
            .every((color) => color === expected);
        }),
      )
      .toBe(true);
  } finally {
    await page.request.delete("/api/notes/toggle-added");
  }
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
 * The big-vault specs use a generated vault to prove the first picture is already
 * settled and interactive, including the reduced-motion path.
 */
const LARGE_PORT = 4824;
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
    // Free mode uses the full-vault rings.
    await page.addInitScript(() => localStorage.setItem("basics:graph-group", "0"));
  });

  test("crowded bands fill multiple rows with ordered boundaries and collision-free labels", async ({ page }) => {
    await page.goto("/graph");
    await expect.poll(async () => (await readPerf(page))?.last?.settledAt ?? null, { timeout: 120_000 }).not.toBeNull();
    const bands = await page.evaluate(() => {
      const cy = (window as unknown as { __basicsCy: CyHandle }).__basicsCy;
      return ["profile", "tech", "practice", "layer"].map((type) => {
        const radii = cy.nodes(`[type = "${type}"]`).map((n) => Math.hypot(n.position().x, n.position().y));
        return { type, min: Math.min(...radii), max: Math.max(...radii), rows: new Set(radii.map((r) => Math.round(r))).size };
      });
    });
    expect(bands[1].rows).toBeGreaterThan(1);
    expect(bands[1].max).toBeLessThan(1500);
    bands.forEach((band, index) => {
      if (index) expect(band.min).toBeGreaterThan(bands[index - 1].max);
    });
    for (const zoom of [0.6, 1.25, 2]) {
      const boxes = await page.evaluate((level) => {
        const cy = (window as unknown as { __basicsCy: CyHandle }).__basicsCy;
        cy.viewport({ zoom: level, pan: cy.pan() });
        return cy
          .nodes()
          .filter((n) => !n.data("ringGuide") && Number(n.style("text-opacity")) > 0)
          .map((n) => ({ id: n.id(), box: n.boundingBox({ includeLabels: true }) }));
      }, zoom);
      expect(boxes.length).toBeGreaterThan(0);
      expect(overlaps(boxes)).toEqual([]);
    }
  });

  test("a node opens its panel from the settled cold ring layout", async ({ page }) => {
    await page.goto("/graph");
    // A cold load of 860 nodes takes the app server-side work before the canvas exists.
    await expect(page.getByTestId("graph-canvas").locator("canvas").first()).toBeVisible({ timeout: 120_000 });

    // Rings are final by the time the first picture paints.
    await expect.poll(async () => (await readPerf(page))?.last?.firstFrameAt ?? null, { timeout: 120_000 }).not.toBeNull();
    const before = await readPerf(page);
    expect(before?.last?.nodes).toBeGreaterThan(500);
    expect(before?.last?.settledAt).not.toBeNull();

    // The tech ring is fitted with the rest of the vault.
    let point = await page.evaluate(() => {
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
    const outside = await page.evaluate(() => {
      const cy = (window as unknown as { __basicsCy: CyHandle }).__basicsCy;
      const host = document.querySelector('[data-testid="graph-canvas"]')!.getBoundingClientRect();
      return cy.nodes().filter((node) => {
        const box = node.renderedBoundingBox({ includeLabels: false });
        return box.x1 < 0 || box.y1 < 0 || box.x2 > host.width || box.y2 > host.height;
      }).length;
    });
    expect(outside).toBe(0);

    // At Fit, 600 tech dots are only a few screen pixels apart. Zoom into the note
    // before targeting it, as a reader does, so pointer rounding cannot hit a neighbor.
    point = await page.evaluate(() => {
      const cy = (window as unknown as { __basicsCy: CyHandle }).__basicsCy;
      const host = document.querySelector('[data-testid="graph-canvas"]')!.getBoundingClientRect();
      const node = cy.getElementById("tech-0");
      const p = node.position();
      const zoom = Math.max(cy.zoom(), 1);
      cy.viewport({ zoom, pan: { x: host.width / 2 - p.x * zoom, y: host.height / 2 - p.y * zoom } });
      const box = node.renderedBoundingBox({ includeLabels: false });
      return { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
    });

    // A real mouse click on the canvas: it only lands if the main thread is free.
    const clickedAt = Date.now();
    await page.mouse.click(origin.x + point.x, origin.y + point.y);
    const drawer = page.getByRole("dialog", { name: "Note details" });
    await expect(drawer).toBeVisible({ timeout: 10_000 });
    await expect(drawer.getByRole("heading", { name: "Tech 0" })).toBeVisible();
    expect(Date.now() - clickedAt).toBeLessThan(10_000);

    // No force simulation is needed before or after opening the drawer.
    const during = await readPerf(page);
    expect(during?.counters.fcose).toBe(0);

    // The picture remains settled with one deterministic placement.
    await expect.poll(async () => (await readPerf(page))?.last?.settledAt ?? null, { timeout: 180_000 }).not.toBeNull();
    const after = await readPerf(page);
    expect(after?.counters.presets).toBe(1);
    expect(after?.counters.fcose).toBe(0);
    expect(after?.counters.glides).toBe(0);
  });

  test("reduced motion jumps to the settled positions instead of gliding", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/graph");
    await expect(page.getByTestId("graph-canvas").locator("canvas").first()).toBeVisible({ timeout: 120_000 });
    await expect.poll(async () => (await readPerf(page))?.last?.settledAt ?? null, { timeout: 180_000 }).not.toBeNull();

    const perf = await readPerf(page);
    expect(perf?.last?.source).toBe("layout");
    expect(perf?.counters.presets).toBe(1);
    expect(perf?.counters.fcose).toBe(0);
    // No intermediate picture and no glide: the nodes were put where they belong.
    expect(perf?.counters.glides).toBe(0);
  });

  test("returning between both grouping modes stays within the measured toggle budget", async ({ page }) => {
    // 860-node measurements after the fix peaked near 183ms for a retained view;
    // 300ms leaves shared-machine headroom while rejecting the old 500-900ms stalls.
    const budget = 300;
    await page.setViewportSize({ width: 1280, height: 820 });
    await page.goto("/graph");
    const toggle = page.getByTestId("graph-group").getByRole("switch");
    await expect.poll(async () => (await readPerf(page))?.last?.settledAt ?? null, { timeout: 120_000 }).not.toBeNull();
    expect((await readPerf(page))?.last?.nodes).toBeGreaterThan(500);
    await page.waitForTimeout(900);
    // Build each view once, then measure the return trip in both directions.
    for (const grouped of [true, false]) {
      await toggle.click();
      await expect
        .poll(async () => {
          const state = await readGraph(page);
          return grouped ? (state?.parentCount ?? 0) > 0 : state?.parentCount === 0;
        })
        .toBe(true);
      await expect.poll(async () => (await readPerf(page))?.last?.settledAt ?? null).not.toBeNull();
      await page.waitForTimeout(900);
    }
    const layouts = (await readPerf(page))!.counters.layouts;
    expect(layouts).toBe(2);
    await page.evaluate(() => {
      const win = window as unknown as { __toggleBudget?: { start: number; frames: number[]; long: number[]; active: boolean } };
      new PerformanceObserver((list) => {
        const sample = win.__toggleBudget;
        if (!sample?.active) return;
        for (const task of list.getEntries()) if (task.startTime >= sample.start) sample.long.push(task.duration);
      }).observe({ type: "longtask", buffered: true });
    });
    const samples: { grouped: boolean; gap: number; long: number[] }[] = [];
    for (const grouped of [true, false, true, false]) {
      await page.evaluate(() => {
        document.addEventListener(
          "click",
          () => {
            const sample = { start: performance.now(), frames: [] as number[], long: [] as number[], active: true };
            sample.frames.push(sample.start);
            (window as unknown as { __toggleBudget: typeof sample }).__toggleBudget = sample;
            const tick = (ts: number) => {
              sample.frames.push(ts);
              if (sample.active) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          },
          { once: true, capture: true },
        );
      });
      await toggle.click();
      await page.waitForFunction(() => {
        const win = window as unknown as {
          __toggleBudget?: { start: number };
          __basicsGraphPerf?: { mounts: { settledAt: number | null }[] };
        };
        return win.__toggleBudget && (win.__basicsGraphPerf?.mounts.at(-1)?.settledAt ?? 0) >= win.__toggleBudget.start;
      });
      await page.waitForTimeout(450);
      const sample = await page.evaluate(() => {
        const sample = (window as unknown as { __toggleBudget: { frames: number[]; long: number[]; active: boolean } }).__toggleBudget;
        sample.active = false;
        let gap = 0;
        for (let i = 1; i < sample.frames.length; i++) gap = Math.max(gap, sample.frames[i] - sample.frames[i - 1]);
        return { gap, long: sample.long };
      });
      samples.push({ grouped, ...sample });
      expect((await readPerf(page))?.counters.layouts).toBe(layouts);
    }
    await test.info().attach("group-toggle-samples", { body: JSON.stringify(samples, null, 2), contentType: "application/json" });
    for (const sample of samples) {
      expect(sample.gap, sample.grouped ? "free to grouped" : "grouped to free").toBeLessThan(budget);
      for (const duration of sample.long) expect(duration).toBeLessThan(budget);
    }
  });
});
