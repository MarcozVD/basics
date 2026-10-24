import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { recommend, Vault } from "../src/index.js";

/** A vault whose layer notes still resolve after `writeNote`, so `techInLayer` finds them. */
function tempVault(): { dir: string; vault: Vault } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-per-layer-"));
  const vault = Vault.load(dir);
  vault.writeNote("data", { type: "layer", tags: [], source: "manual" }, "# Data");
  vault.writeNote("empty", { type: "layer", tags: [], source: "manual" }, "# Empty");
  return { dir, vault };
}

function tech(vault: Vault, id: string, layer: string, use_when: string[]) {
  vault.writeNote(
    id,
    { type: "tech", kind: "database", layer, use_when, avoid_when: [], performs_best: [], tags: [], source: "manual" },
    `# ${id}`,
  );
}

test("per_layer is a maximum: only scored candidates are returned, capped", () => {
  const { dir, vault } = tempVault();
  try {
    tech(vault, "alpha-db", "data", ["alpha workloads"]);
    tech(vault, "bravo-db", "data", ["bravo workloads"]);
    tech(vault, "charlie-db", "data", ["charlie workloads"]);
    tech(vault, "zulu-db", "data", ["zulu workloads"]);
    tech(vault, "novel-db", "empty", ["unrelated situation"]);

    const result = recommend(vault, "alpha bravo charlie", { perLayer: 10, layers: ["data", "empty"] });

    assert.equal(result.layers.data.length, 3);
    assert.deepEqual(result.layers.data.map((candidate) => candidate.id).sort(), ["alpha-db", "bravo-db", "charlie-db"]);
    // A layer where nothing matches returns an empty list, not the raw tech list.
    assert.deepEqual(result.layers.empty, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("per_layer caps a layer that matches more than the limit", () => {
  const { dir, vault } = tempVault();
  try {
    tech(vault, "alpha-db", "data", ["alpha workloads"]);
    tech(vault, "alpha-two", "data", ["alpha pipelines"]);
    tech(vault, "alpha-three", "data", ["alpha stores"]);
    tech(vault, "alpha-four", "data", ["alpha clusters"]);

    const result = recommend(vault, "alpha", { perLayer: 2, layers: ["data"] });

    assert.equal(result.layers.data.length, 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
