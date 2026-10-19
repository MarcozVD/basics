import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Vault } from "../src/core/vault.js";
import { recommend, stackContext } from "../src/core/query.js";

function tempVault(): Vault {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-"));
  fs.cpSync("vault", dir, { recursive: true });
  return Vault.load(dir);
}

test("seed vault loads without issues", () => {
  const v = Vault.load("vault");
  assert.deepEqual(v.issues, []);
  assert.ok(v.get("fastapi"));
  assert.ok(v.getBacklinks("python").includes("fastapi"));
});

test("recommend ranks API frameworks for an API description", () => {
  const r = recommend(Vault.load("vault"), "API REST async para servir modelos de machine learning");
  assert.equal(r.layers.backend[0].id, "fastapi");
  assert.equal(r.profiles[0].id, "ml-api");
});

test("stack context pulls language practices and checks", () => {
  const ctx = stackContext(Vault.load("vault"), ["fastapi"]);
  assert.deepEqual(ctx.techs.map((t) => t.id).sort(), ["fastapi", "python"]);
  assert.ok(ctx.practices.some((p) => p.id === "python-typing"));
  assert.ok(ctx.checks.some((c) => c.id === "fastapi-endpoint-tests"));
});

test("agent proposals stay in inbox until approved", () => {
  const v = tempVault();
  v.propose(
    "django",
    { type: "tech", kind: "framework", layer: "backend", language: "python", use_when: ["admin CRUD"], avoid_when: [], performs_best: [], related: [], practices: [], checks: [], tags: [], source: "manual" },
    "# Django",
    { proposed_by: "test-agent", reason: "missing" },
  );
  assert.equal(v.get("django"), undefined);
  assert.equal(v.listProposals()[0].meta.action, "create");
  v.approve("django");
  assert.equal(v.get("django")?.data.source, "agent:test-agent");
  assert.equal(v.listProposals().length, 0);
});
