import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { ConflictError, Vault } from "../src/index.js";

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");

function tempVault(): Vault {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-"));
  fs.cpSync(SEED, dir, { recursive: true });
  return Vault.load(dir);
}

const techData = () => ({
  type: "tech" as const,
  kind: "framework" as const,
  layer: "backend",
  use_when: [],
  avoid_when: [],
  performs_best: [],
  related: [],
  practices: [],
  checks: [],
  tags: [],
  source: "manual",
});

test("writeNote leaves no temp files behind", () => {
  const v = tempVault();
  v.writeNote("demo", techData(), "# Demo");
  assert.deepEqual(
    fs.readdirSync(path.join(v.root, "tech")).filter((f) => f.endsWith(".tmp")),
    [],
  );
});

test("writeNote throws ConflictError when the file changed on disk", () => {
  const v = tempVault();
  const oldHash = v.get("fastapi")?.hash;
  assert.ok(oldHash);
  fs.appendFileSync(path.join(v.root, "tech", "fastapi.md"), "\nchanged\n");
  assert.throws(() => v.writeNote("fastapi", techData(), "# FastAPI", { expectedHash: oldHash }), ConflictError);
});

test("writeNote succeeds with the fresh hash after reload", () => {
  const v = tempVault();
  const file = path.join(v.root, "tech", "fastapi.md");
  fs.appendFileSync(file, "\nchanged\n");
  v.reload();
  const freshHash = v.get("fastapi")?.hash;
  assert.ok(freshHash);
  v.writeNote("fastapi", techData(), "# FastAPI", { expectedHash: freshHash });
  assert.equal(v.get("fastapi")?.body, "# FastAPI");
  assert.deepEqual(v.issues, []);
});

test("writeNote without expectedHash overwrites a changed file", () => {
  const v = tempVault();
  fs.appendFileSync(path.join(v.root, "tech", "fastapi.md"), "\nchanged\n");
  v.writeNote("fastapi", techData(), "# FastAPI");
  assert.equal(v.get("fastapi")?.body, "# FastAPI");
});
