import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluate,
  installPack,
  listPacks,
  loadConfig,
  loadIndex,
  recommend,
  recommendHybrid,
  syncIndex,
  Vault,
} from "../../packages/core/dist/index.js";
import { auditDataset } from "./audit-github.mjs";
import { hash } from "./github-data.mjs";
import { metricRows, regressions, rowKey } from "./metrics.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const fixtures = path.join(root, "packages/core/test/fixtures");
function privateFile() {
  if (process.env.BASICS_PRIVATE_EVAL) {
    if (!fs.existsSync(process.env.BASICS_PRIVATE_EVAL)) throw new Error("BASICS_PRIVATE_EVAL points to a missing file");
    return process.env.BASICS_PRIVATE_EVAL;
  }
  const local = path.join(root, "docs/agents/realeval-private.json");
  if (fs.existsSync(local)) return local;
  try {
    const common = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const candidate = path.join(path.dirname(path.resolve(root, common)), "docs/agents/realeval-private.json");
    if (fs.existsSync(candidate)) return candidate;
  } catch {
    /* Source archives have no git metadata. */
  }
}
export function normalizeCases(raw, name) {
  const rows = Array.isArray(raw) ? raw : raw.cases;
  if (!Array.isArray(rows) || !rows.length) throw new Error(`${name}: empty/malformed cases`);
  return rows.map((row, i) => {
    const description = row.description ?? row.d;
    const expect = row.expect ?? Object.fromEntries(Object.entries(row.e ?? {}).map(([layer, top3]) => [layer, { top3 }]));
    const lang = row.lang ?? (/\b(una?|para|con|que|datos|pruebas|servicio|aplicación)\b/i.test(description ?? "") ? "es" : "en");
    if (typeof description !== "string" || !description.trim() || !["en", "es"].includes(lang) || !Object.keys(expect).length)
      throw new Error(`${name}: invalid case ${i}`);
    if (row.split && !["dev", "holdout", "tune", "held-out"].includes(row.split)) throw new Error(`${name}: invalid split ${i}`);
    for (const item of Object.values(expect))
      if (!(item.top1 || (Array.isArray(item.top3) && item.top3.length))) throw new Error(`${name}: missing ground truth ${i}`);
    return {
      description,
      lang,
      expect,
      indirect: row.indirect === true,
      ...(row.split ? { split: row.split } : {}),
      ...(row.category ? { category: row.category } : {}),
    };
  });
}
export async function runEvaluation(args = process.argv.slice(2)) {
  const flags = new Set(args);
  if (flags.has("--help")) {
    console.log(
      "npm run eval [-- --json | --realistic | --hybrid | --record-baseline]\nDefault: internal, realistic, public GitHub and optional private sets; keywords plus hybrid when runtime exists. --record-baseline explicitly replaces recorded metrics. --grid retains the legacy experiment runner.",
    );
    return;
  }
  const baselineFile = path.join(root, "scripts/eval/baseline.json");
  const sets = [
    { name: "internal", file: path.join(fixtures, "recommend-eval.json"), kind: "packs" },
    { name: "realistic", file: path.join(fixtures, "realistic-eval.json"), kind: "realistic" },
    { name: "github", file: path.join(root, "scripts/eval/github-repos.json"), kind: "packs" },
  ];
  const privatePath = process.env.CI ? undefined : privateFile();
  const skipped = [];
  if (privatePath) sets.push({ name: "private", file: privatePath, kind: "packs" });
  else
    skipped.push({
      set: "private",
      reason: process.env.CI
        ? "other vault, not comparable; private set intentionally skipped in CI"
        : "other vault, not comparable; realeval-private.json unavailable; supply BASICS_PRIVATE_EVAL to gate it",
    });
  const selected = flags.has("--realistic") ? sets.filter((s) => s.name === "realistic") : sets;
  if (flags.has("--record-baseline") && (flags.has("--realistic") || flags.has("--hybrid")))
    throw new Error("Record all sets/modes together, without --realistic or --hybrid");
  const prepared = selected.map((s) => {
    const bytes = fs.readFileSync(s.file, "utf8");
    const raw = JSON.parse(bytes);
    let auditFingerprint;
    if (s.name === "github") {
      const labels = fs.readFileSync(path.join(root, "scripts/eval/github-quality-labels.json"), "utf8");
      const audit = auditDataset(bytes, JSON.parse(labels));
      const categories = new Map(audit.cases.map((c) => [`https://github.com/${c.repo}`, c.category]));
      for (const c of raw.cases) c.category = categories.get(c.repo);
      auditFingerprint = hash(labels);
    }
    return { ...s, fingerprint: hash(bytes), auditFingerprint, cases: normalizeCases(raw, s.name) };
  });
  const dirs = [];
  const vaults = {};
  const rows = [];
  let model;
  try {
    for (const lang of ["en", "es"]) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), `basics-eval-${lang}-`));
      dirs.push(dir);
      const vault = Vault.load(dir);
      for (const pack of listPacks(path.join(root, "packs"))) installPack(vault, path.join(root, "packs"), pack.name, { lang });
      vaults[`packs/${lang}`] = vault;
    }
    // Clone the realistic fixture so hybrid indexing never writes caches into tracked fixtures.
    const realDir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-eval-realistic-"));
    dirs.push(realDir);
    fs.cpSync(path.join(fixtures, "realistic-vault"), realDir, { recursive: true });
    vaults["realistic/en"] = vaults["realistic/es"] = Vault.load(realDir);
    const runtime = await import("../../packages/basics/dist/embeddings-runtime.js");
    const available = runtime.runtimeInstalled();
    if (flags.has("--hybrid") && !available) throw new Error(`Hybrid eval requires embeddings runtime at ${runtime.runtimeDir()}`);
    const modes = flags.has("--hybrid") ? ["hybrid"] : available ? ["keywords", "hybrid"] : ["keywords"];
    if (!available) skipped.push({ mode: "hybrid", reason: "embeddings runtime unavailable" });
    let embedder;
    const indexes = new Map();
    if (modes.includes("hybrid")) {
      const loaded = await runtime.loadRuntime();
      if (!loaded) throw new Error("Installed embeddings runtime could not load");
      embedder = await runtime.createEmbedder(loaded, loadConfig().embeddingsModel);
      model = embedder.model;
      for (const vault of new Set(Object.values(vaults))) {
        await syncIndex(vault, embedder);
        indexes.set(vault, loadIndex(vault));
      }
    }
    for (const mode of modes)
      for (const set of prepared) {
        const entries = [];
        for (const testCase of set.cases) {
          const vault = vaults[`${set.kind}/${testCase.lang}`];
          const result =
            mode === "hybrid"
              ? await recommendHybrid(vault, testCase.description, indexes.get(vault), embedder, { perLayer: 1000 })
              : recommend(vault, testCase.description, { perLayer: 1000 });
          // Preserve the historical displayed-top-three forbid contract while
          // measuring reciprocal rank over the complete positive shortlist.
          const full = evaluate(vault, [testCase], () => result).perCase[0];
          const displayed = {
            ...result,
            layers: Object.fromEntries(Object.entries(result.layers).map(([layer, candidates]) => [layer, candidates.slice(0, 3)])),
          };
          const entry = evaluate(vault, [testCase], () => displayed).perCase[0];
          for (let i = 0; i < entry.layers.length; i++) entry.layers[i].reciprocalRank = full.layers[i].reciprocalRank;
          if (testCase.category) entry.category = testCase.category;
          entries.push(entry);
        }
        rows.push(...metricRows(set.name, mode, entries));
      }
    const fingerprints = Object.fromEntries(prepared.map((set) => [set.name, set.fingerprint]));
    for (const set of prepared) if (set.auditFingerprint) fingerprints[`${set.name}-audit`] = set.auditFingerprint;
    for (const row of rows) if (row.set === "private") row.comparison = "other vault, not comparable";
    let failures = [];
    if (flags.has("--record-baseline")) {
      if (rows.some((row) => ![row.hit1, row.hit3, row.mrr].every(Number.isFinite)))
        throw new Error("Invalid eval metrics; rebuild before recording a baseline");
      fs.writeFileSync(
        baselineFile,
        `${JSON.stringify({ schema_version: 1, mrr_definition: "reciprocal first relevant rank across positive candidates, macro averaged over expected layers", fingerprints, ...(model ? { hybrid_model: model } : {}), rows: Object.fromEntries(rows.map((row) => [rowKey(row), row])), unavailable: skipped }, null, 2)}\n`,
      );
    } else {
      const baseline = JSON.parse(fs.readFileSync(baselineFile, "utf8"));
      failures = regressions(rows, baseline, fingerprints, model);
    }
    if (flags.has("--json")) console.log(JSON.stringify({ rows, skipped, failures }, null, 2));
    else {
      console.log("set          mode       split       cases  hit@1  hit@3  MRR    forbid");
      for (const r of rows)
        console.log(
          `${r.set.padEnd(12)} ${r.mode.padEnd(10)} ${r.split.padEnd(19)} ${String(r.cases).padEnd(6)} ${r.hit1.toFixed(3)}  ${r.hit3.toFixed(3)}  ${r.mrr.toFixed(3)}  ${r.forbid}${r.comparison ? `  (${r.comparison})` : ""}`,
        );
      for (const skip of skipped) console.log(`SKIP ${skip.set ?? skip.mode}: ${skip.reason}`);
      for (const fail of failures) console.error(`REGRESSION ${fail}`);
      if (!failures.length) console.log(flags.has("--record-baseline") ? "Recorded baseline." : "Baseline gates PASS.");
    }
    if (failures.length) process.exitCode = 1;
    return { rows, skipped, failures };
  } finally {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  }
}
