// Drives the Basics desktop app through the VIDEO.md scenes while Recordly records its window.
// Writes capture/timeline.json: scene marks, cursor moves, clicks and keys, in ms after the sync flash.
//
//   node capture/record.mjs --app      attach over CDP to the Basics app (WebView2 started with
//                                      --remote-debugging-port=9333) and drive its window
//   node capture/record.mjs --probe    headless Chromium at the app's window size, one screenshot per step
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "../../package.json"));
const { chromium } = require("playwright");

const PROBE = process.argv.includes("--probe");
const BASE = process.env.BASICS_URL ?? (PROBE ? "http://127.0.0.1:4748" : "http://127.0.0.1:4747");
const probeDir = path.join(here, "probe");
if (PROBE) fs.mkdirSync(probeDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

let t0 = Date.now();
const now = () => Date.now() - t0;
let step = 0;

let browser;
let page;
if (PROBE) {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, locale: "es-ES", colorScheme: "dark" });
  page = await context.newPage();
} else {
  browser = await chromium.connectOverCDP("http://127.0.0.1:9333");
  page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .find((candidate) => candidate.url().startsWith(BASE));
  if (!page) throw new Error(`no Basics app page on ${BASE}`);
  await page.emulateMedia({ colorScheme: "dark" });
}
// Language lives in the global basics config; override it per response instead of changing it.
await page.route("**/api/config", async (route) => {
  if (route.request().method() !== "GET") return route.continue();
  const response = await route.fetch();
  const body = await response.json();
  await route.fulfill({ response, json: { ...body, language: "es" } });
});
// The app's WebView keeps the owner's preferences for this origin; put them back when done.
await page.goto(`${BASE}/`);
const savedStorage = await page.evaluate(() => JSON.stringify(localStorage));
await page.evaluate(() => localStorage.setItem("basics-theme", "dark"));

const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
console.log("viewport", viewport.width, viewport.height);
const timeline = { ...viewport, scenes: [], events: [] };
let cursor = { x: Math.round(viewport.width * 0.8), y: Math.round(viewport.height * 0.8) };

async function shot(label) {
  if (!PROBE) return;
  step += 1;
  await page.screenshot({ path: path.join(probeDir, `${String(step).padStart(3, "0")}-${label}.png`) });
}

async function pointOf(target) {
  if ("x" in target && "y" in target && typeof target.x === "number") return target;
  await target.waitFor({ state: "visible", timeout: 10_000 });
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error("target has no box");
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

async function moveTo(target, dur = 650) {
  const to = await pointOf(target);
  const from = { ...cursor };
  timeline.events.push({ type: "move", t: now(), dur, from, to });
  const frames = Math.max(1, Math.round(dur / 16));
  for (let i = 1; i <= frames; i++) {
    const k = ease(i / frames);
    await page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
    await sleep(dur / frames);
  }
  cursor = to;
  return to;
}

async function click(target, { dur = 650, before = 280, after = 500, label = "" } = {}) {
  const p = await moveTo(target, dur);
  await sleep(before);
  timeline.events.push({ type: "click", t: now(), x: p.x, y: p.y, label });
  await page.mouse.click(p.x, p.y);
  await sleep(after);
  await shot(`click-${label}`);
}

async function hover(target, hold = 700, dur = 600) {
  await moveTo(target, dur);
  await sleep(hold);
}

async function key(combo, after = 450) {
  timeline.events.push({ type: "key", t: now(), key: combo });
  await page.keyboard.press(combo);
  await sleep(after);
  await shot(`key-${combo.replace(/\W/g, "")}`);
}

async function type(text, delay = 55, after = 300) {
  timeline.events.push({ type: "type", t: now(), text, dur: text.length * delay });
  await page.keyboard.type(text, { delay });
  await sleep(after);
}

function scene(id) {
  timeline.scenes.push({ id, t: now() });
  console.log(`[${(now() / 1000).toFixed(1)}s] scene ${id}`);
}

// ---------------------------------------------------------------- warm up
await page.goto(`${BASE}/`);
await page.waitForSelector('[data-stat="tech"]');
await page.evaluate(() => document.fonts.ready);
await sleep(1500);

if (!PROBE) {
  // Give Recordly time to start, then a magenta flash marks t0 in the footage.
  const lead = Number(process.env.LEAD_MS ?? 4000);
  await sleep(lead);
}
await page.evaluate(() => {
  const flash = document.createElement("div");
  flash.id = "sync-flash";
  flash.style.cssText = "position:fixed;inset:0;background:#ff00ff;z-index:2147483647";
  document.body.appendChild(flash);
});
await sleep(700);
await page.evaluate(() => document.getElementById("sync-flash")?.remove());
t0 = Date.now();
await page.mouse.move(cursor.x, cursor.y);
await sleep(800);

// ---------------------------------------------------------------- 3 Home
scene("home");
await shot("home");
await hover(page.locator('[data-stat="tech"]'), 600);
await hover(page.locator('[data-stat="practice"]'), 450, 400);
await hover(page.locator('[data-stat="check"]'), 450, 400);
await hover(page.locator('[data-stat^="layer-"]').first(), 500, 600);
await hover(page.locator('[data-stat^="layer-"]').nth(2), 500, 450);
await click(page.locator('[data-stat="broken"]'), { label: "broken" });
await sleep(500);
const brokenRow = page.locator('[data-broken-link="tanstack-query"]');
await hover(brokenRow, 600);
await click(brokenRow.getByRole("button").last(), { label: "create-note" });
await sleep(900);
const dialog = page.getByRole("dialog");
await hover(dialog.getByRole("button").last(), 900);
await key("Escape", 700);

// ---------------------------------------------------------------- 4 Explore
scene("explore");
await click(page.locator('nav a[href="/explore"]'), { label: "nav-explore", after: 900 });
await click(page.getByRole("button", { name: "Todas las capas", exact: true }), { label: "layers" });
await click(page.getByRole("listbox").getByRole("option", { name: "Frontend", exact: true }), { label: "frontend" });
await sleep(500);
await click(page.getByRole("tab", { name: "Cuadrícula", exact: true }), { label: "grid", after: 1100 });
await click(page.getByRole("tab", { name: "Lista", exact: true }), { label: "list", after: 800 });
await hover(page.locator("[data-note-row]").first(), 400);
await page.locator("[data-note-row]").first().focus();
await key("ArrowDown", 500);
await key("ArrowDown", 500);
await key("Enter", 1200);

// ---------------------------------------------------------------- 5 Editor
scene("editor");
if (!page.url().endsWith("/notes/typescript")) await page.goto(`${BASE}/notes/typescript`);
await sleep(600);
await shot("editor");
await hover(page.getByLabel("Título", { exact: true }), 700);
await click(page.getByRole("tab", { name: "Dividido", exact: true }), { label: "split", after: 900 });
const cm = page.locator(".cm-content").first();
const cmBox = await cm.boundingBox();
await click({ x: Math.round(cmBox.x + cmBox.width * 0.6), y: Math.round(cmBox.y + cmBox.height - 12) }, { label: "editor" });
await key("Control+End", 300);
await key("Enter", 200);
await type("Probado con ");
await type("[[", 120, 700);
await type("vit", 120, 900);
await key("Enter", 300);
// The editor auto-closes `[[`; drop the extra brackets the completion leaves behind.
await page.keyboard.press("Delete");
await page.keyboard.press("Delete");
await type(" en el equipo.", 55, 800);
await click(page.getByRole("button", { name: /Conexiones/ }).first(), { label: "connections", after: 1400 });
await hover(page.locator("canvas").last(), 1400);
await key("Control+s", 1500);

// ---------------------------------------------------------------- 6 Graph
scene("graph");
await page
  .locator("body")
  .click({ position: { x: 5, y: 5 } })
  .catch(() => {});
await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
await key("g", 120);
await key("g", 1800);
await click(page.getByTestId("graph-search"), { label: "graph-search" });
await type("react", 110, 600);
await key("Enter", 1800);
await shot("graph-drawer");
const drawer = page.getByRole("dialog", { name: /nota/i });
await hover(drawer, 800).catch(() => {});
await key("Escape", 900);

// ---------------------------------------------------------------- 8 Inbox
scene("inbox");
await hover(page.locator('nav a[href="/inbox"]'), 900);
await click(page.locator('nav a[href="/inbox"]'), { label: "nav-inbox", after: 1000 });
await click(page.locator('[data-proposal-id="react"]').getByRole("button").first(), { label: "proposal-react", after: 1200 });
await click(
  page
    .getByRole("tab", { name: "Unificado", exact: true })
    .or(page.getByRole("button", { name: "Unificado", exact: true }))
    .first(),
  { label: "unified", after: 1300 },
);
await click(
  page
    .getByRole("tab", { name: "Lado a lado", exact: true })
    .or(page.getByRole("button", { name: "Lado a lado", exact: true }))
    .first(),
  { label: "side", after: 1300 },
);
await key("a", 1600);

// ---------------------------------------------------------------- 9 Recommend
scene("recommend");
await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
await key("g", 120);
await key("r", 1200);
await click(page.getByLabel("Describe el proyecto", { exact: true }), { label: "describe" });
await type("App web de reservas con pagos, calendario y panel de administración", 38, 500);
// Every layer starts selected; narrow it to the three a booking app needs.
await click(page.getByRole("button", { name: "Infra", exact: true }), { label: "layer-infra", after: 350 });
await click(page.getByRole("button", { name: "Testing", exact: true }), { label: "layer-testing", after: 350 });
await page.getByLabel("Describe el proyecto", { exact: true }).focus();
await key("Control+Enter", 1500);
await shot("recommend-results");
const pick = page.getByRole("checkbox").first();
await hover(page.getByRole("heading", { name: "Frontend", exact: true }), 1200);
await click(pick, { label: "pick-1", after: 350 });
const picks = await page.getByRole("checkbox").count();
for (const index of [Math.min(3, picks - 1), Math.min(6, picks - 1)]) {
  if (index > 0) await click(page.getByRole("checkbox").nth(index), { label: `pick-${index}`, after: 350 });
}
await click(page.getByRole("button", { name: "Exportar stack", exact: true }), { label: "export", after: 1000 });
const exportDialog = page.getByRole("dialog");
for (const tab of ["AGENTS.md", "CLAUDE.md", "Cursor", "STACK.md"]) {
  await click(exportDialog.getByRole("tab", { name: tab, exact: true }), { label: `tab-${tab}`, dur: 500, after: 800 });
}
await click(exportDialog.getByRole("button", { name: /Copiar/i }).first(), { label: "copy", after: 1200 });
await key("Escape", 700);

// ---------------------------------------------------------------- 11 Palette + theme
scene("palette");
await key("Control+k", 900);
await type("tema", 90, 900);
await key("Escape", 500);
await click(page.getByRole("button", { name: "Tema" }).first(), { label: "theme", after: 1800 });
scene("end");
await sleep(1000);

fs.writeFileSync(path.join(here, PROBE ? "timeline.probe.json" : "timeline.json"), JSON.stringify(timeline, null, 2));
console.log("done", (now() / 1000).toFixed(1), "s");
await page.evaluate((saved) => {
  localStorage.clear();
  for (const [key, value] of Object.entries(JSON.parse(saved))) localStorage.setItem(key, value);
}, savedStorage);
await page.unroute("**/api/config");
await page.goto(`${BASE}/`);
await browser.close();
