/**
 * Graph load harness (V15-T5).
 *
 * Measures, on the built app: cold first frame, cold settled, long tasks > 50 ms,
 * return-to-graph first frame, reload first frame and how many layouts each step ran.
 * Runs against two vaults: `examples/vault` and a generated one with 600 techs.
 *
 * Usage (repo root, after `npm run build`):
 *   node packages/ui/e2e/graph-perf.mjs --label before
 *
 * It owns its servers (ports 4811/4812), temp vaults, temp config and a throwaway
 * HOME/USERPROFILE/APPDATA under the OS temp folder. Nothing touches the real vault,
 * config or home. Timings come from the page (`window.__basicsGraphPerf`, published
 * only when `__BASICS_E2E__` is set before load) and from a `longtask` observer.
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "@playwright/test";

const repoRoot = path.resolve(import.meta.dirname, "../../..");
const cli = path.join(repoRoot, "packages", "basics", "dist", "cli.js");
const argv = process.argv.slice(2);
const label = argv.includes("--label") ? argv[argv.indexOf("--label") + 1] : "run";
const outFile = argv.includes("--out") ? argv[argv.indexOf("--out") + 1] : null;
const only = argv.includes("--only") ? argv[argv.indexOf("--only") + 1] : null;
const TECHS = 600;
const PRACTICES = 240;
const LAYERS = 12;
const PROFILES = 8;

if (!fs.existsSync(cli)) {
  console.error(`missing ${cli}; run \`npm run build\` first`);
  process.exit(1);
}

const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-graph-perf-"));
const exampleVault = path.join(runDir, "vault-examples");
const syntheticVault = path.join(runDir, "vault-synthetic");
fs.cpSync(path.join(repoRoot, "examples", "vault"), exampleVault, { recursive: true });
generateVault(syntheticVault);

/** 600 techs + 240 practices + 12 layers + 8 profiles, cross-linked like a real stack vault. */
function generateVault(dir) {
  const write = (folder, id, frontmatter, body) => {
    const target = path.join(dir, folder);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, `${id}.md`), `---\n${frontmatter}\n---\n\n${body}\n`);
  };
  for (let i = 0; i < LAYERS; i++) {
    write("layers", `layer-${i}`, `type: layer\ntitle: Layer ${i}\ndescription: Synthetic layer ${i}`, `# Layer ${i}`);
  }
  for (let i = 0; i < TECHS; i++) {
    const related = [`tech-${(i + 1) % TECHS}`, `tech-${(i + 7) % TECHS}`];
    write(
      "tech",
      `tech-${i}`,
      [
        "type: tech",
        "kind: framework",
        `title: Tech ${i}`,
        `layer: layer-${i % LAYERS}`,
        `related: [${related.join(", ")}]`,
        `practices: [practice-${i % PRACTICES}]`,
      ].join("\n"),
      `# Tech ${i}\n\nSynthetic tech for the graph perf harness.`,
    );
  }
  for (let i = 0; i < PRACTICES; i++) {
    write(
      "practices",
      `practice-${i}`,
      `type: practice\ntitle: Practice ${i}\napplies_to: [tech-${(i * 5) % TECHS}]`,
      `- Synthetic practice ${i}.`,
    );
  }
  for (let i = 0; i < PROFILES; i++) {
    const stack = Array.from({ length: LAYERS }, (_, layer) => `  layer-${layer}: [tech-${(layer + i) % TECHS}]`).join("\n");
    write("profiles", `profile-${i}`, `type: profile\ntitle: Profile ${i}\nstack:\n${stack}`, `# Profile ${i}`);
  }
}

function startServer(port, vault, tag) {
  const config = path.join(runDir, `config-${tag}.json`);
  fs.writeFileSync(config, JSON.stringify({ language: "en" }));
  const home = path.join(runDir, `home-${tag}`);
  const appData = path.join(home, "AppData", "Roaming");
  fs.mkdirSync(appData, { recursive: true });
  const child = spawn(process.execPath, [cli, "--vault", vault, "ui", "--no-open", "--port", String(port)], {
    stdio: "ignore",
    env: { ...process.env, BASICS_CONFIG: config, HOME: home, USERPROFILE: home, APPDATA: appData },
  });
  return child;
}

async function waitHealth(base) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      // Server still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`server at ${base} did not become healthy`);
}

function positions(page) {
  return page.evaluate(() => {
    const cy = window.__basicsCy;
    if (!cy) return null;
    return Object.fromEntries(cy.nodes().map((node) => [node.id(), { x: node.position().x, y: node.position().y }]));
  });
}

/** Two painted frames, so canvas work queued by the layout effect has landed. */
function afterPaint(page) {
  return page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
}

function readPerf(page) {
  return page.evaluate(() => window.__basicsGraphPerf ?? null);
}

function readCache(page) {
  return page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem("basics:graph-cache:v1");
      if (!raw) return null;
      return JSON.parse(raw).map((entry) => ({
        key: entry.key,
        vault: entry.vault,
        layout: entry.layout,
        count: Object.keys(entry.positions ?? {}).length,
        backend: entry.positions?.backend ?? null,
        bandTop: entry.positions?.["band:top"] ?? null,
        camera: entry.camera,
      }));
    } catch {
      return "unreadable";
    }
  });
}

async function waitSettled(page, mounts) {
  await page.waitForFunction(
    (min) => {
      const perf = window.__basicsGraphPerf;
      if (!perf || perf.counters.mounts < min) return false;
      const last = perf.mounts[perf.mounts.length - 1];
      return Boolean(last?.firstFrameAt && last.settledAt);
    },
    mounts,
    { timeout: 240_000 },
  );
}

function summarize(cold, longTasks) {
  const during = longTasks.filter((task) => cold && task.start <= (cold.settledAt ?? cold.firstFrameAt ?? 0));
  return {
    longTasks: during.length,
    longestLongTaskMs: during.length ? Math.round(Math.max(...during.map((task) => task.duration))) : 0,
    totalLongTaskMs: Math.round(during.reduce((sum, task) => sum + task.duration, 0)),
  };
}

async function measureVariant(browser, base, grouped) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 } });
  await context.addInitScript(
    ({ grouped: on }) => {
      window.__BASICS_E2E__ = true;
      try {
        localStorage.setItem("basics:graph-group", on ? "1" : "0");
      } catch {}
      window.__basicsLongTasks = [];
      try {
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__basicsLongTasks.push({ start: entry.startTime, duration: entry.duration });
          }
        }).observe({ type: "longtask", buffered: true });
      } catch {}
    },
    { grouped },
  );
  const page = await context.newPage();
  const result = { grouped, viewport: "1280x820" };

  // Cold: first visit in a fresh session.
  await page.goto(`${base}/graph`, { waitUntil: "load" });
  await waitSettled(page, 1);
  const coldPerf = await readPerf(page);
  const cold = coldPerf.mounts[coldPerf.mounts.length - 1];
  const longTasks = await page.evaluate(() => window.__basicsLongTasks ?? []);
  await afterPaint(page);
  const coldPositions = await positions(page);
  result.nodes = cold.nodes;
  result.edges = cold.edges;
  result.coldIdleMs = Math.round(cold.idleAt);
  result.coldFirstFrameMs = Math.round(cold.firstFrameAt);
  result.coldSettledMs = Math.round(cold.settledAt);
  result.coldLayouts = coldPerf.counters.layouts;
  result.coldPhases = cold.phases;
  result.cacheAfterCold = await readCache(page);
  Object.assign(result, summarize(cold, longTasks));

  // Return: leave the graph and come back in the same session.
  await page.getByRole("link", { name: "Explore" }).click();
  await page.waitForURL(/\/explore$/);
  await page.waitForTimeout(400);
  const beforeReturn = await readPerf(page);
  await page.evaluate(() => {
    window.__basicsLongTasks = [];
    const link = document.querySelector('a[aria-label="Graph"]');
    link?.addEventListener(
      "click",
      () => {
        window.__graphClickAt = performance.now();
      },
      { once: true },
    );
  });
  await page.getByRole("link", { name: "Graph" }).click();
  await waitSettled(page, beforeReturn.counters.mounts + 1);
  const returnPerf = await readPerf(page);
  const returned = returnPerf.mounts[returnPerf.mounts.length - 1];
  const clickAt = await page.evaluate(() => window.__graphClickAt ?? 0);
  await afterPaint(page);
  const returnPositions = await positions(page);
  const returnLongTasks = await page.evaluate(() => window.__basicsLongTasks ?? []);
  result.returnMountMs = Math.round(returned.mountedAt - clickAt);
  result.returnIdleMs = Math.round(returned.idleAt - clickAt);
  result.returnFirstFrameMs = Math.round(returned.firstFrameAt - clickAt);
  result.returnSettledMs = Math.round(returned.settledAt - clickAt);
  result.returnLayouts = returnPerf.counters.layouts - beforeReturn.counters.layouts;
  result.returnSource = returned.source;
  result.returnPhases = returned.phases;
  result.cacheAfterReturn = await readCache(page);
  result.returnLongTasks = returnLongTasks.length;
  result.returnLongestLongTaskMs = returnLongTasks.length ? Math.round(Math.max(...returnLongTasks.map((task) => task.duration))) : 0;
  const returnDiff = positionDiff(coldPositions, returnPositions);
  result.returnDiffDetail = returnDiff.ids.map((id) => ({ id, cold: coldPositions?.[id], returned: returnPositions?.[id] }));
  Object.assign(result, prefixDiff("return", returnDiff));

  // Reload: sessionStorage should carry the positions across a full page load.
  await page.evaluate(() => {
    window.__basicsLongTasks = [];
  });
  await page.reload({ waitUntil: "load" });
  await waitSettled(page, 1);
  const reloadPerf = await readPerf(page);
  const reloaded = reloadPerf.mounts[reloadPerf.mounts.length - 1];
  await afterPaint(page);
  const reloadPositions = await positions(page);
  const reloadLongTasks = await page.evaluate(() => window.__basicsLongTasks ?? []);
  result.reloadMountMs = Math.round(reloaded.mountedAt);
  result.reloadIdleMs = Math.round(reloaded.idleAt);
  result.reloadFirstFrameMs = Math.round(reloaded.firstFrameAt);
  result.reloadSettledMs = Math.round(reloaded.settledAt);
  result.reloadLayouts = reloadPerf.counters.layouts;
  result.reloadPhases = reloaded.phases;
  result.reloadLongTasks = reloadLongTasks.length;
  result.reloadLongestLongTaskMs = reloadLongTasks.length ? Math.round(Math.max(...reloadLongTasks.map((task) => task.duration))) : 0;
  Object.assign(result, prefixDiff("reload", positionDiff(coldPositions, reloadPositions)));

  await context.close();
  return result;
}

function prefixDiff(prefix, diff) {
  return {
    [`${prefix}PositionsMatch`]: diff.differing === 0,
    [`${prefix}PositionsDiffer`]: diff.differing,
    [`${prefix}MaxDelta`]: diff.maxDelta,
    [`${prefix}DiffIds`]: diff.ids,
  };
}

/** How far two position maps diverge; used to explain a `pos same: no`. */
function positionDiff(a, b) {
  if (!a || !b) return { differing: -1, maxDelta: -1, ids: [] };
  let differing = 0;
  let maxDelta = 0;
  const ids = [];
  for (const [id, from] of Object.entries(a)) {
    const to = b[id];
    if (!to) {
      differing += 1;
      if (ids.length < 6) ids.push(id);
      continue;
    }
    const delta = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
    if (delta >= 0.5) {
      differing += 1;
      if (ids.length < 6) ids.push(id);
    }
    maxDelta = Math.max(maxDelta, delta);
  }
  return { differing, maxDelta: Math.round(maxDelta), ids };
}

function table(results) {
  const rows = [];
  for (const [vault, variants] of Object.entries(results.vaults)) {
    for (const variant of Object.values(variants)) {
      rows.push([
        vault,
        variant.grouped ? "grouped" : "flat",
        variant.nodes,
        variant.coldFirstFrameMs,
        variant.coldSettledMs,
        variant.longTasks,
        variant.longestLongTaskMs,
        variant.returnFirstFrameMs,
        variant.returnSettledMs,
        variant.returnLayouts,
        variant.reloadFirstFrameMs,
        variant.reloadLayouts,
        variant.returnPositionsMatch ? "yes" : "no",
        variant.reloadPositionsMatch ? "yes" : "no",
      ]);
    }
  }
  const header = [
    "vault",
    "layout",
    "nodes",
    "cold 1st frame ms",
    "cold settled ms",
    "long tasks",
    "longest ms",
    "return 1st frame ms",
    "return settled ms",
    "return layouts",
    "reload 1st frame ms",
    "reload layouts",
    "return pos same",
    "reload pos same",
  ];
  const widths = header.map((cell, index) => Math.max(cell.length, ...rows.map((row) => String(row[index]).length)));
  const line = (cells) => cells.map((cell, index) => String(cell).padEnd(widths[index])).join("  ");
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join("\n");
}

const servers = [];
try {
  servers.push(startServer(4811, exampleVault, "examples"));
  servers.push(startServer(4812, syntheticVault, "synthetic"));
  await Promise.all([waitHealth("http://127.0.0.1:4811"), waitHealth("http://127.0.0.1:4812")]);

  const browser = await chromium.launch();
  const results = { label, generatedAt: new Date().toISOString(), vaults: {} };
  const plans = [
    ["examples", "http://127.0.0.1:4811", true],
    ["examples", "http://127.0.0.1:4811", false],
    ["synthetic600", "http://127.0.0.1:4812", true],
    ["synthetic600", "http://127.0.0.1:4812", false],
  ];
  try {
    for (const [vault, base, grouped] of plans) {
      if (only && `${vault}-${grouped ? "grouped" : "flat"}` !== only) continue;
      results.vaults[vault] ??= {};
      results.vaults[vault][grouped ? "grouped" : "flat"] = await measureVariant(browser, base, grouped);
    }
  } finally {
    await browser.close();
  }

  console.log(`\n# graph perf (${label})\n`);
  console.log(table(results));
  console.log("\n## render phases (ms)\n");
  for (const [vault, variants] of Object.entries(results.vaults)) {
    for (const variant of Object.values(variants)) {
      console.log(
        `${vault} ${variant.grouped ? "grouped" : "flat"} · cold ${JSON.stringify(variant.coldPhases)} · return ${JSON.stringify(variant.returnPhases)} (source ${variant.returnSource}, mount ${variant.returnMountMs}ms, first frame ${variant.returnFirstFrameMs}ms, settled ${variant.returnSettledMs}ms, layouts ${variant.returnLayouts}, long tasks ${variant.returnLongTasks}/${variant.returnLongestLongTaskMs}ms) · reload ${JSON.stringify(variant.reloadPhases)} (mount ${variant.reloadMountMs}ms, first frame ${variant.reloadFirstFrameMs}ms) · return diff ${variant.returnPositionsDiffer} ${JSON.stringify(variant.returnDiffDetail)}`,
      );
    }
  }
  console.log("");
  if (outFile) {
    fs.writeFileSync(path.resolve(outFile), `${JSON.stringify(results, null, 2)}\n`);
    console.log(`json: ${path.resolve(outFile)}`);
  }
} finally {
  for (const server of servers) server.kill();
  fs.rmSync(runDir, { recursive: true, force: true });
}
