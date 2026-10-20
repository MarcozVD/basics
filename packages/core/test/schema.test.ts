import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { noteSchema, Vault } from "../src/index.js";

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");

function tempVault(): Vault {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-"));
  fs.cpSync(SEED, dir, { recursive: true });
  return Vault.load(dir);
}

test("project notes parse and default status to active", () => {
  const p = noteSchema.parse({ type: "project", stack: { backend: ["fastapi"] } });
  if (p.type !== "project") throw new Error(`expected project, got ${p.type}`);
  assert.equal(p.status, "active");
  assert.deepEqual(p.stack, { backend: ["fastapi"] });
});

test("unknown frontmatter fields survive a write/reload round-trip", () => {
  const v = tempVault();
  v.writeNote(
    "demo",
    {
      type: "tech",
      kind: "framework",
      layer: "backend",
      use_when: [],
      avoid_when: [],
      performs_best: [],
      related: [],
      practices: [],
      checks: [],
      tags: [],
      source: "manual",
      custom_field: "x",
    },
    "# Demo",
  );
  const data = v.get("demo")?.data as Record<string, unknown>;
  assert.equal(data.custom_field, "x");
});

test("practice notes keep since/until", () => {
  const p = noteSchema.parse({ type: "practice", applies_to: [], since: "2.0", until: "3.0" });
  if (p.type !== "practice") throw new Error(`expected practice, got ${p.type}`);
  assert.equal(p.since, "2.0");
  assert.equal(p.until, "3.0");
});

test("project notes contribute backlinks", () => {
  const v = tempVault();
  v.writeNote(
    "my-ml-app",
    { type: "project", status: "active", stack: { backend: ["fastapi"] }, lessons: [], tags: [], source: "manual" },
    "# My ML app",
  );
  assert.ok(v.getBacklinks("fastapi").includes("my-ml-app"));
});
