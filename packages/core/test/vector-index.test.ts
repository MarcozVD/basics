import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { type Embedder, embeddingPaths, loadIndex, type NoteData, syncIndex, Vault } from "../src/index.js";

class FakeEmbedder implements Embedder {
  calls: number[] = [];
  texts: string[] = [];

  constructor(
    readonly model = "fake-e5",
    readonly dim = 4,
  ) {}

  async embed(texts: string[], kind: "query" | "passage"): Promise<Float32Array[]> {
    this.calls.push(texts.length);
    this.texts.push(...texts.map((text) => `${kind}:${text}`));
    return texts.map((text) => {
      const vector = new Float32Array(this.dim);
      let state = 2166136261;
      for (const char of `${this.model}:${text}`) {
        state ^= char.charCodeAt(0);
        state = Math.imul(state, 16777619);
      }
      for (let i = 0; i < this.dim; i++) vector[i] = ((state >>> (i * 3)) & 0xffff) / 0xffff;
      return vector;
    });
  }
}

function tech(use_when: string[]): NoteData {
  return {
    type: "tech",
    kind: "framework",
    title: "FastAPI",
    layer: "backend",
    use_when,
    avoid_when: ["heavy server-side HTML"],
    performs_best: ["async I/O"],
    tags: ["api", "rest"],
    practices: [],
    checks: [],
    related: [],
    source: "manual",
  };
}

function setup(): { dir: string; vault: Vault } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-index-"));
  const vault = Vault.load(dir);
  vault.writeNote("fastapi", tech(["async REST API"]), "# FastAPI\n\nAsync framework.");
  vault.writeNote(
    "python-typing",
    { type: "practice", applies_to: ["fastapi"], tags: [], source: "manual" },
    "# Python typing\n\nUse type hints in public functions.",
  );
  vault.writeNote(
    "saas",
    { type: "profile", description: "SaaS web product", use_when: ["fullstack SaaS"], stack: {}, tags: [], source: "manual" },
    "# SaaS",
  );
  return { dir, vault };
}

test("syncIndex embeds once, then only re-embeds changed notes", async () => {
  const { dir, vault } = setup();
  try {
    const embedder = new FakeEmbedder();
    const first = await syncIndex(vault, embedder);
    assert.equal(first.notes, 3);
    assert.equal(first.embedded, 4);
    assert.deepEqual(embedder.calls, [4]);
    assert.equal(loadIndex(vault).get("fastapi", "pos")?.length, 4);
    assert.equal(loadIndex(vault).get("fastapi", "neg")?.length, 4);

    const second = await syncIndex(vault, embedder);
    assert.equal(second.embedded, 0);
    assert.equal(second.reused, 4);
    assert.deepEqual(embedder.calls, [4]);

    vault.writeNote("fastapi", tech(["async REST API v2"]), "# FastAPI\n\nAsync framework.");
    const before = embedder.texts.length;
    const third = await syncIndex(vault, embedder);
    assert.equal(third.embedded, 2);
    assert.equal(third.reused, 2);
    assert.equal(embedder.calls.length, 2);
    assert.equal(embedder.texts.length - before, 2);
    assert.ok(embedder.texts.slice(before).some((text) => text.includes("v2")));
    assert.equal(loadIndex(vault).stale(vault).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("syncIndex drops deleted notes and compacts the bin", async () => {
  const { dir, vault } = setup();
  try {
    const embedder = new FakeEmbedder();
    await syncIndex(vault, embedder);
    const fullSize = fs.statSync(embeddingPaths(vault).bin).size;

    vault.deleteNote("saas");
    const stats = await syncIndex(vault, embedder);
    assert.equal(stats.removed, 1);
    assert.equal(loadIndex(vault).notes, 2);
    assert.equal(loadIndex(vault).get("saas", "main"), undefined);
    assert.equal(fs.statSync(embeddingPaths(vault).bin).size, fullSize - embedder.dim * 4);
    assert.equal(loadIndex(vault).stale(vault).length, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a different model rebuilds every note", async () => {
  const { dir, vault } = setup();
  try {
    const embedder = new FakeEmbedder("model-a", 4);
    await syncIndex(vault, embedder);
    const first = loadIndex(vault).get("fastapi", "pos");

    const changed = new FakeEmbedder("model-b", 4);
    const stats = await syncIndex(vault, changed);
    assert.equal(stats.embedded, 4);
    assert.equal(stats.reused, 0);
    assert.deepEqual(changed.calls, [4]);
    const index = loadIndex(vault);
    assert.equal(index.model, "model-b");
    assert.notDeepEqual(index.get("fastapi", "pos"), first);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("loadIndex round-trips vectors from disk and reports stale notes", async () => {
  const { dir, vault } = setup();
  try {
    const embedder = new FakeEmbedder();
    await syncIndex(vault, embedder);
    const expected = loadIndex(vault).get("fastapi", "pos");

    const reloaded = loadIndex(Vault.load(dir));
    assert.equal(reloaded.model, "fake-e5");
    assert.deepEqual(reloaded.get("fastapi", "pos"), expected);
    assert.equal(reloaded.stale(Vault.load(dir)).length, 0);

    vault.writeNote(
      "python-typing",
      { type: "practice", applies_to: ["fastapi"], tags: [], source: "manual" },
      "# Python typing\n\nChanged.",
    );
    const stale = loadIndex(Vault.load(dir)).stale(Vault.load(dir));
    assert.deepEqual(stale, ["python-typing"]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
