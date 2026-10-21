import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { type EvalCase, evaluate, installPack, listPacks, recommend, Vault } from "../src/index.js";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const PACKS = path.join(ROOT, "packs");
const CASES = path.join(import.meta.dirname, "fixtures/recommend-eval.json");

function tempVaults(): { dirs: string[]; vaults: Record<string, Vault> } {
  const dirs: string[] = [];
  const vaults: Record<string, Vault> = {};
  const packs = listPacks(PACKS).map((pack) => pack.name);
  for (const lang of ["en", "es"]) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `basics-eval-${lang}-`));
    dirs.push(dir);
    const vault = Vault.load(dir);
    for (const pack of packs) installPack(vault, PACKS, pack, { lang });
    vaults[lang] = vault;
  }
  return { dirs, vaults };
}

test("keyword recommendation eval meets hit@3 and forbid thresholds", () => {
  const cases = JSON.parse(fs.readFileSync(CASES, "utf8")) as EvalCase[];
  const { dirs, vaults } = tempVaults();
  try {
    const perCase = cases.map((testCase) => evaluate(vaults[testCase.lang], [testCase], recommend).perCase[0]);
    const expectations = perCase.flatMap((entry) => entry.layers);
    const hit1 = expectations.filter((layer) => layer.hit1).length / expectations.length;
    const hit3 = expectations.filter((layer) => layer.hit3).length / expectations.length;
    const forbidViolations = perCase.reduce((sum, entry) => sum + entry.forbidViolations, 0);
    console.log(`recommend eval: cases=${cases.length} hit@1=${hit1.toFixed(3)} hit@3=${hit3.toFixed(3)} forbid=${forbidViolations}`);
    assert.ok(hit3 >= 0.8, `hit@3 ${hit3.toFixed(3)} below 0.8`);
    assert.equal(forbidViolations, 0);
  } finally {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  }
});
