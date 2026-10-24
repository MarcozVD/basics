import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { type Embedder, loadIndex, minMaxNormalize, recommend, recommendHybrid, syncIndex, Vault } from "../src/index.js";

const DIM = 4;

/** Basis vectors keep the fake deterministic: money, dashboard, browser, unrelated. */
function vectorFor(text: string): Float32Array {
  const lower = text.toLowerCase();
  const values = [0, 0, 0, 0];
  if (/money|payment|ledger|transaction/.test(lower)) values[0] = 1;
  if (/dashboard|widget|interactive/.test(lower)) values[1] = 1;
  if (/browser|click/.test(lower)) values[2] = 1;
  if (values.every((value) => value === 0)) values[3] = 1;
  const norm = Math.hypot(...values);
  return Float32Array.from(values, (value) => value / norm);
}

const fakeEmbedder: Embedder = {
  model: "fake",
  dim: DIM,
  async embed(texts) {
    return texts.map(vectorFor);
  },
};

function tempVault(): { dir: string; vault: Vault } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-hybrid-"));
  const vault = Vault.load(dir);
  vault.writeNote("data", { type: "layer", tags: [], source: "manual" }, "# Data");
  return { dir, vault };
}

async function indexed(vault: Vault) {
  await syncIndex(vault, fakeEmbedder);
  return loadIndex(vault);
}

test("fuses keyword and semantic scores into a known ranking", async () => {
  const { dir, vault } = tempVault();
  try {
    vault.writeNote(
      "ledger",
      {
        type: "tech",
        kind: "database",
        layer: "data",
        use_when: ["records applied as one unit"],
        avoid_when: [],
        performs_best: [],
        tags: [],
        source: "manual",
      },
      "# Ledger\n\nMoney movements that never leave a partial state.",
    );
    vault.writeNote(
      "panel",
      {
        type: "tech",
        kind: "library",
        layer: "data",
        use_when: ["interactive view with local state"],
        avoid_when: [],
        performs_best: [],
        tags: [],
        source: "manual",
      },
      "# Panel\n\nDashboard widgets.",
    );
    vault.writeNote(
      "payments",
      {
        type: "profile",
        use_when: ["payments that stay consistent"],
        stack: { data: ["ledger"] },
        tags: [],
        source: "manual",
      },
      "# Payments",
    );

    const index = await indexed(vault);
    const result = await recommendHybrid(vault, "payments that stay consistent", index, fakeEmbedder);
    const candidates = result.layers.data;

    assert.equal(result.mode, "hybrid");
    // `panel` has no keyword signal and a similarity below the fused floor, so it is dropped.
    assert.deepEqual(
      candidates.map((candidate) => candidate.id),
      ["ledger"],
    );
    // The only keyword signal is a synonym ("money" in the body); semantics land on the fixed
    // cosine scale's top, so the fused score is 0.4 * keyword(3/6) + 0.6 * semantic(1).
    assert.equal(candidates[0].score, 3);
    assert.equal(candidates[0].score_breakdown.keywords, 0);
    assert.equal(candidates[0].score_breakdown.text, 0);
    assert.equal(candidates[0].score_breakdown.synonyms, 3);
    assert.equal(candidates[0].score_breakdown.semantic, 1);
    assert.equal(candidates[0].hybrid, 0.8);
    assert.equal(result.profiles[0].id, "payments");
    assert.equal(result.profiles[0].hybrid, 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("normalization keeps equal scores neutral", () => {
  assert.deepEqual(minMaxNormalize([]), []);
  assert.deepEqual(minMaxNormalize([5]), [0.5]);
  assert.deepEqual(minMaxNormalize([2, 2, 2]), [0.5, 0.5, 0.5]);
  assert.deepEqual(minMaxNormalize([1, 2, 3]), [0, 0.5, 1]);
});

test("negated spans penalize the tech whose positive text they resemble", async () => {
  const { dir, vault } = tempVault();
  try {
    vault.writeNote(
      "ledger",
      {
        type: "tech",
        kind: "database",
        layer: "data",
        use_when: ["records applied as one unit"],
        avoid_when: [],
        performs_best: [],
        tags: [],
        source: "manual",
      },
      "# Ledger\n\nMoney movements.",
    );
    vault.writeNote(
      "panel",
      {
        type: "tech",
        kind: "library",
        layer: "data",
        use_when: ["payments that stay consistent"],
        avoid_when: [],
        performs_best: [],
        tags: [],
        source: "manual",
      },
      "# Panel\n\nMoney dashboard.",
    );

    const index = await indexed(vault);
    const description = "payments that stay consistent, no money movements";

    const gentle = await recommendHybrid(vault, description, index, fakeEmbedder, { floor: 0, ceil: 1 });

    const harsh = await recommendHybrid(vault, description, index, fakeEmbedder, { mu: 1.5, floor: 0, ceil: 1 });
    const ledgerSemantic = (r: typeof gentle) =>
      r.layers.data.find((candidate) => candidate.id === "ledger")?.score_breakdown.semantic ?? -1;
    // A heavier negation weight pushes the tech the negated span resembles further down.
    assert.ok(ledgerSemantic(gentle) > ledgerSemantic(harsh));
    assert.equal(harsh.layers.data[0].id, "panel");
    assert.equal(harsh.layers.data.find((candidate) => candidate.id === "ledger")?.score_breakdown.semantic, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("keyword mode reports itself", () => {
  const { dir, vault } = tempVault();
  try {
    vault.writeNote(
      "ledger",
      {
        type: "tech",
        kind: "database",
        layer: "data",
        use_when: ["payments that stay consistent"],
        avoid_when: [],
        performs_best: [],
        tags: [],
        source: "manual",
      },
      "# Ledger",
    );
    const result = recommend(vault, "payments that stay consistent");
    assert.equal(result.mode, "keywords");
    assert.equal(result.layers.data[0].hybrid, undefined);
    assert.equal(result.layers.data[0].score_breakdown.semantic, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
