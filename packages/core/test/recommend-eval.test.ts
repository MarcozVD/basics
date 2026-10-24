import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { type EvalCase, type EvalCaseResult, evaluate, installPack, listPacks, recommend, Vault } from "../src/index.js";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const PACKS = path.join(ROOT, "packs");
const CASES = path.join(import.meta.dirname, "fixtures/recommend-eval.json");
/** Indirect cases describe a project without naming the technology; keywords alone find fewer. */
const INDIRECT_HIT1 = 0.6;

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

function metrics(entries: EvalCaseResult[]): { cases: number; hit1: number; hit3: number; forbid: number } {
  const layers = entries.flatMap((entry) => entry.layers);
  return {
    cases: entries.length,
    hit1: layers.length ? layers.filter((layer) => layer.hit1).length / layers.length : 0,
    hit3: layers.length ? layers.filter((layer) => layer.hit3).length / layers.length : 0,
    forbid: entries.reduce((sum, entry) => sum + entry.forbidViolations, 0),
  };
}

test("keyword recommendation eval meets hit@3 and forbid thresholds", () => {
  const cases = JSON.parse(fs.readFileSync(CASES, "utf8")) as EvalCase[];
  const { dirs, vaults } = tempVaults();
  try {
    const perCase = cases.map((testCase) => evaluate(vaults[testCase.lang], [testCase], recommend).perCase[0]);
    const all = metrics(perCase);
    const direct = metrics(perCase.filter((entry) => !entry.indirect));
    const indirect = metrics(perCase.filter((entry) => entry.indirect));
    const holdout = metrics(perCase.filter((entry) => entry.split === "holdout"));
    console.log(
      `recommend eval (keywords): cases=${all.cases} hit@1=${all.hit1.toFixed(3)} hit@3=${all.hit3.toFixed(3)} forbid=${all.forbid}`,
    );
    console.log(`  direct: cases=${direct.cases} hit@1=${direct.hit1.toFixed(3)} hit@3=${direct.hit3.toFixed(3)}`);
    console.log(`  indirect: cases=${indirect.cases} hit@1=${indirect.hit1.toFixed(3)} hit@3=${indirect.hit3.toFixed(3)}`);
    console.log(`  holdout: cases=${holdout.cases} hit@1=${holdout.hit1.toFixed(3)} hit@3=${holdout.hit3.toFixed(3)}`);
    assert.equal(all.forbid, 0);
    assert.ok(direct.hit3 >= 0.8, `direct hit@3 ${direct.hit3.toFixed(3)} below 0.8`);
    assert.ok(indirect.hit3 >= 0.8, `indirect hit@3 ${indirect.hit3.toFixed(3)} below 0.8`);
    assert.ok(indirect.hit1 >= INDIRECT_HIT1, `indirect hit@1 ${indirect.hit1.toFixed(3)} below ${INDIRECT_HIT1}`);
  } finally {
    for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true });
  }
});
