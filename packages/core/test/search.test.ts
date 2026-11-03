import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { buildSearchIndex, search, searchAll, Vault } from "../src/index.js";

/** Notes named so the ranking is predictable: an id hit weighs more than a body hit. */
function tempVault(): { dir: string; vault: Vault } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-search-"));
  const vault = Vault.load(dir);
  vault.writeNote("cache", { type: "layer", tags: [], source: "manual" }, "# Cache");
  vault.writeNote(
    "redis",
    { type: "tech", kind: "database", layer: "cache", use_when: ["shared cache between instances"], tags: [], source: "manual" },
    "# Redis\n\nIn-memory cache.",
  );
  vault.writeNote("memcached", { type: "tech", kind: "database", layer: "cache", tags: [], source: "manual" }, "# Memcached");
  vault.writeNote("postgres", { type: "tech", kind: "database", layer: "data", tags: [], source: "manual" }, "# Postgres");
  vault.writeNote("queue-practice", { type: "practice", tags: [], source: "manual" }, "- Flush the cache after a write.");
  return { dir, vault };
}

test("search ranks an id/title hit above a body-only hit and honours type and layer", () => {
  const { dir, vault } = tempVault();
  try {
    const hits = search(vault, "cache");
    assert.equal(hits[0].id, "cache");
    assert.ok(hits.find((hit) => hit.id === "redis"));
    assert.ok(hits.find((hit) => hit.id === "queue-practice"));
    assert.deepEqual(Object.keys(hits[0]).sort(), ["id", "score", "title", "type"]);

    assert.deepEqual(
      search(vault, "cache", { type: "tech" }).map((hit) => hit.id),
      ["redis"],
    );
    assert.deepEqual(
      search(vault, "postgres", { layer: "cache" }).map((hit) => hit.id),
      [],
    );
    assert.deepEqual(search(vault, "  "), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a pre-built index returns exactly what building one per call returns", () => {
  const { dir, vault } = tempVault();
  try {
    const index = buildSearchIndex(vault);
    for (const query of ["cache", "redis cache", "postgres", "flush write", "nothing here"]) {
      assert.deepEqual(search(vault, query, {}, index), search(vault, query));
      assert.deepEqual(
        search(vault, query, { type: "tech", layer: "cache" }, index),
        search(vault, query, { type: "tech", layer: "cache" }),
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("searchAll reports the matches before the cap, so a truncated list can say so", () => {
  const { dir, vault } = tempVault();
  try {
    const page = searchAll(vault, "cache", { limit: 1 });
    assert.equal(page.hits.length, 1);
    assert.ok(page.total > page.hits.length);

    const index = buildSearchIndex(vault);
    const capped = searchAll(vault, "cache", { limit: 1 }, index);
    assert.equal(capped.hits.length, 1);
    assert.equal(capped.total, search(vault, "cache").length);
    assert.equal(searchAll(vault, "nothing here").total, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
