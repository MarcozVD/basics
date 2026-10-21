import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evaluate, installPack, listPacks, recommend, Vault } from "../packages/core/dist/index.js";

const root = path.resolve(import.meta.dirname, "..");
const packsDir = path.join(root, "packs");
const casesFile = path.join(root, "packages/core/test/fixtures/recommend-eval.json");
const cases = JSON.parse(fs.readFileSync(casesFile, "utf8"));
const asJson = process.argv.includes("--json");
const packs = listPacks(packsDir).map((pack) => pack.name);
const vaults = {};

function makeVault(lang) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `basics-eval-${lang}-`));
  const vault = Vault.load(dir);
  for (const pack of packs) installPack(vault, packsDir, pack, { lang });
  return { dir, vault };
}

try {
  for (const lang of ["en", "es"]) vaults[lang] = makeVault(lang);

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

  const expectations = perCase.flatMap((entry) => entry.layers);
  const result = {
    cases: cases.length,
    hit1: expectations.length ? expectations.filter((layer) => layer.hit1).length / expectations.length : 0,
    hit3: expectations.length ? expectations.filter((layer) => layer.hit3).length / expectations.length : 0,
    forbidViolations: perCase.reduce((sum, entry) => sum + entry.forbidViolations, 0),
    perCase,
  };

  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${"case".padEnd(62)} lang  hit@1  hit@3  forbid`);
    for (const entry of perCase) {
      const description = entry.description.length > 60 ? `${entry.description.slice(0, 59)}…` : entry.description;
      console.log(
        `${description.padEnd(62)} ${entry.lang.padEnd(5)} ${(entry.hit1 ? "yes" : "no").padEnd(6)} ${(entry.hit3 ? "yes" : "no").padEnd(6)} ${entry.forbidViolations}`,
      );
    }
    console.log(
      `\ncases=${result.cases} hit@1=${result.hit1.toFixed(3)} hit@3=${result.hit3.toFixed(3)} forbid=${result.forbidViolations}`,
    );
  }
} finally {
  for (const { dir } of Object.values(vaults)) fs.rmSync(dir, { recursive: true, force: true });
}
