import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
} from "../packages/core/dist/index.js";

const root = path.resolve(import.meta.dirname, "..");
const packsDir = path.join(root, "packs");
const casesFile = path.join(root, "packages/core/test/fixtures/recommend-eval.json");
const cases = JSON.parse(fs.readFileSync(casesFile, "utf8"));
const flags = new Set(process.argv.slice(2));
const asJson = flags.has("--json");
const grid = flags.has("--grid");
const hybrid = flags.has("--hybrid") || grid;
const packs = listPacks(packsDir).map((pack) => pack.name);
const vaults = {};

function makeVault(lang) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `basics-eval-${lang}-`));
  const vault = Vault.load(dir);
  for (const pack of packs) installPack(vault, packsDir, pack, { lang });
  return { dir, vault };
}

/** Memoized wrapper so grid sweeps do not re-embed the same text. */
function cachedEmbedder(embedder) {
  const cache = new Map();
  return {
    model: embedder.model,
    dim: embedder.dim,
    async embed(texts, kind) {
      const missing = [...new Set(texts.filter((text) => !cache.has(`${kind}:${text}`)))];
      if (missing.length) {
        const vectors = await embedder.embed(missing, kind);
        for (const [index, text] of missing.entries()) cache.set(`${kind}:${text}`, vectors[index]);
      }
      return texts.map((text) => cache.get(`${kind}:${text}`));
    },
  };
}

async function loadHybrid() {
  const { createEmbedder, loadRuntime, runtimeDir, runtimeInstalled } = await import("../packages/basics/dist/embeddings-runtime.js");
  if (!runtimeInstalled()) {
    console.error(`hybrid eval needs the embeddings runtime at ${runtimeDir()}; run \`basics embeddings enable\` first`);
    process.exit(1);
  }
  const runtime = await loadRuntime();
  if (!runtime) {
    console.error(`could not load the embeddings runtime from ${runtimeDir()}; run \`basics embeddings enable\` first`);
    process.exit(1);
  }
  const embedder = cachedEmbedder(await createEmbedder(runtime, loadConfig().embeddingsModel));
  const indexes = {};
  for (const [lang, { vault }] of Object.entries(vaults)) {
    const stats = await syncIndex(vault, embedder);
    indexes[lang] = loadIndex(vault);
    process.stderr.write(`[${lang}] index: ${stats.notes} notes, ${stats.embedded} embedded, ${stats.reused} reused\n`);
  }
  return { embedder, indexes };
}

function keywordPerCase() {
  const perCase = new Array(cases.length);
  for (const lang of ["en", "es"]) {
    const indexes = cases.map((testCase, index) => ({ testCase, index })).filter(({ testCase }) => testCase.lang === lang);
    if (!indexes.length) continue;
    const result = evaluate(
      vaults[lang].vault,
      indexes.map(({ testCase }) => testCase),
      recommend,
    );
    result.perCase.forEach((entry, i) => {
      perCase[indexes[i].index] = entry;
    });
  }
  return perCase;
}

async function hybridPerCase(embedder, indexes, opts) {
  const perCase = new Array(cases.length);
  for (const lang of ["en", "es"]) {
    const selected = cases.map((testCase, index) => ({ testCase, index })).filter(({ testCase }) => testCase.lang === lang);
    if (!selected.length) continue;
    const recommendations = new Map();
    for (const { testCase } of selected) {
      recommendations.set(
        `${lang}:${testCase.description}`,
        await recommendHybrid(vaults[lang].vault, testCase.description, indexes[lang], embedder, opts),
      );
    }
    const result = evaluate(
      vaults[lang].vault,
      selected.map(({ testCase }) => testCase),
      (_vault, description) => recommendations.get(`${lang}:${description}`),
    );
    result.perCase.forEach((entry, i) => {
      perCase[selected[i].index] = entry;
    });
  }
  return perCase;
}

function summary(perCase) {
  const layers = perCase.flatMap((entry) => entry.layers);
  const indirect = perCase.filter((entry) => entry.indirect);
  const indirectLayers = indirect.flatMap((entry) => entry.layers);
  const holdout = perCase.filter((entry) => entry.split === "holdout");
  const holdoutLayers = holdout.flatMap((entry) => entry.layers);
  const ratio = (rows, key) => (rows.length ? rows.filter((row) => row[key]).length / rows.length : 0);
  return {
    cases: cases.length,
    hit1: ratio(layers, "hit1"),
    hit3: ratio(layers, "hit3"),
    forbidViolations: perCase.reduce((sum, entry) => sum + entry.forbidViolations, 0),
    indirect: {
      cases: indirect.length,
      hit1: ratio(indirectLayers, "hit1"),
      hit3: ratio(indirectLayers, "hit3"),
      forbidViolations: indirect.reduce((sum, entry) => sum + entry.forbidViolations, 0),
    },
    holdout: {
      cases: holdout.length,
      hit1: ratio(holdoutLayers, "hit1"),
      hit3: ratio(holdoutLayers, "hit3"),
      forbidViolations: holdout.reduce((sum, entry) => sum + entry.forbidViolations, 0),
    },
  };
}

function print(result, mode) {
  if (asJson) {
    console.log(JSON.stringify({ mode, ...result }, null, 2));
    return;
  }
  console.log(`${"case".padEnd(62)} kind  lang  hit@1  hit@3  forbid`);
  for (const entry of result.perCase) {
    const description = entry.description.length > 60 ? `${entry.description.slice(0, 59)}…` : entry.description;
    console.log(
      `${description.padEnd(62)} ${(entry.indirect ? "ind" : "dir").padEnd(5)} ${entry.lang.padEnd(5)} ${(entry.hit1 ? "yes" : "no").padEnd(6)} ${(entry.hit3 ? "yes" : "no").padEnd(6)} ${entry.forbidViolations}`,
    );
  }
  console.log(
    `\nmode=${mode} cases=${result.cases} hit@1=${result.hit1.toFixed(3)} hit@3=${result.hit3.toFixed(3)} forbid=${result.forbidViolations}`,
  );
  console.log(
    `indirect cases=${result.indirect.cases} hit@1=${result.indirect.hit1.toFixed(3)} hit@3=${result.indirect.hit3.toFixed(3)} forbid=${result.indirect.forbidViolations}`,
  );
  if (result.holdout.cases) {
    console.log(
      `holdout cases=${result.holdout.cases} hit@1=${result.holdout.hit1.toFixed(3)} hit@3=${result.holdout.hit3.toFixed(3)} forbid=${result.holdout.forbidViolations}`,
    );
  }
}

try {
  for (const lang of ["en", "es"]) vaults[lang] = makeVault(lang);

  if (grid) {
    const { embedder, indexes } = await loadHybrid();
    const combos = [];
    const mu = 0.5;
    for (const w of [0.2, 0.3, 0.4, 0.5, 0.6]) {
      for (const theta of [0.8, 0.85]) {
        for (const floor of [0.7, 0.75, 0.8]) {
          for (const ceil of [0.88, 0.92]) {
            const perCase = await hybridPerCase(embedder, indexes, { weight: w, theta, mu, floor, ceil });
            combos.push({ w, theta, mu, floor, ceil, result: summary(perCase) });
          }
        }
      }
    }
    const valid = combos.filter(({ result }) => result.forbidViolations === 0);
    const ranked = [...valid].sort(
      (a, b) => b.result.hit3 - a.result.hit3 || b.result.hit1 - a.result.hit1 || b.result.indirect.hit1 - a.result.indirect.hit1,
    );
    for (const { w, theta, mu, floor, ceil, result } of ranked.slice(0, 10)) {
      console.log(
        `w=${w.toFixed(1)} theta=${theta.toFixed(2)} mu=${mu.toFixed(1)} floor=${floor} ceil=${ceil} hit@3=${result.hit3.toFixed(3)} hit@1=${result.hit1.toFixed(3)} forbid=${result.forbidViolations} indirect hit@1=${result.indirect.hit1.toFixed(3)}`,
      );
    }
    const best = ranked[0];
    if (!best) {
      console.log("no parameter combination had zero forbid violations");
      process.exitCode = 1;
    } else {
      console.log(
        `\nbest: w=${best.w.toFixed(1)} theta=${best.theta.toFixed(2)} mu=${best.mu.toFixed(1)} floor=${best.floor} ceil=${best.ceil} hit@3=${best.result.hit3.toFixed(3)} hit@1=${best.result.hit1.toFixed(3)} forbid=0`,
      );
    }
  } else {
    let perCase;
    if (hybrid) {
      const { embedder, indexes } = await loadHybrid();
      perCase = await hybridPerCase(embedder, indexes);
    } else {
      perCase = keywordPerCase();
    }
    print({ ...summary(perCase), perCase }, hybrid ? "hybrid" : "keywords");
  }
} finally {
  for (const { dir } of Object.values(vaults)) fs.rmSync(dir, { recursive: true, force: true });
}
