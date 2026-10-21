import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { installPack, packNotes, updatePack, Vault } from "../src/index.js";

const PACKS = path.resolve(import.meta.dirname, "../../../packs");

function tempVault(): Vault {
  return Vault.load(fs.mkdtempSync(path.join(os.tmpdir(), "basics-update-")));
}

function tempPacks(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-packs-src-"));
  fs.cpSync(PACKS, dir, { recursive: true });
  return dir;
}

test("updatePack proposes changed and new notes, approve-all stamps the pack source", () => {
  const vault = tempVault();
  installPack(vault, PACKS, "python-api");

  const packs = tempPacks();
  const manifestFile = path.join(packs, "python-api", "pack.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, version: "1.2.0" }, null, 2));

  fs.appendFileSync(path.join(packs, "python-api", "notes", "en", "tech", "python.md"), "\nAdd type hints everywhere.\n");
  fs.writeFileSync(
    path.join(packs, "python-api", "notes", "en", "tech", "django.md"),
    `---
type: tech
kind: framework
title: Django
layer: backend
language: python
use_when:
  - admin CRUD
avoid_when: []
performs_best: []
related: []
practices: []
checks: []
tags: [django]
---
# Django

Batteries-included framework.
`,
  );

  const result = updatePack(vault, packs, "python-api");
  assert.deepEqual(result.proposed.sort(), ["django", "python"]);
  assert.equal(result.unchanged.length, 8);
  assert.equal(vault.listProposals().length, 2);

  const proposal = vault.getProposal("python");
  assert.equal(proposal?.meta.action, "update");
  assert.equal(proposal?.meta.proposed_by, "pack:python-api@1.2.0");
  assert.equal(proposal?.meta.reason, "Pack python-api 1.1.0 → 1.2.0");

  const approved = vault.approveAll({ pack: "python-api" });
  assert.deepEqual(approved.sort(), ["django", "python"]);
  assert.equal(vault.get("python")?.data.source, "pack:python-api@1.2.0");
  assert.equal(vault.get("django")?.data.source, "pack:python-api@1.2.0");
  assert.equal(vault.get("fastapi")?.data.source, "pack:python-api@1.1.0");
  assert.equal(vault.get("python")?.data.pack_lang, "en");
  assert.equal(vault.listProposals().length, 0);
});

test("updatePack is a no-op when the bundled version is not newer", () => {
  const vault = tempVault();
  installPack(vault, PACKS, "python-api");
  const python = vault.get("python");
  assert.ok(python);
  vault.writeNote("python", python.data, `${python.body}\nlocal edit`);

  const result = updatePack(vault, PACKS, "python-api");
  assert.deepEqual(result, {
    proposed: [],
    unchanged: packNotes(PACKS, "python-api", "en").map((note) => note.id),
    skipped: [],
    upToDate: true,
  });
  assert.equal(vault.listProposals().length, 0);
  assert.match(vault.get("python")?.body ?? "", /local edit/);
});

test("updatePack loads each note in its recorded pack_lang", () => {
  const vault = tempVault();
  installPack(vault, PACKS, "python-api", { lang: "es" });
  const packs = tempPacks();
  const manifestFile = path.join(packs, "python-api", "pack.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, version: "1.2.0" }, null, 2));
  fs.appendFileSync(path.join(packs, "python-api", "notes", "es", "tech", "python.md"), "\nCambio en español.\n");

  const result = updatePack(vault, packs, "python-api");
  assert.ok(result.proposed.includes("python"));
  assert.match(vault.getProposal("python")?.body ?? "", /Cambio en español/);
  assert.equal(vault.getProposal("python")?.data.pack_lang, "es");
});

test("updatePack skips notes the pack does not own", () => {
  const vault = tempVault();
  installPack(vault, PACKS, "python-api");
  const python = vault.get("python");
  assert.ok(python);
  vault.writeNote("python", { ...python.data, source: "manual" }, python.body);

  const packs = tempPacks();
  const manifestFile = path.join(packs, "python-api", "pack.json");
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  fs.writeFileSync(manifestFile, JSON.stringify({ ...manifest, version: "1.2.0" }, null, 2));
  fs.appendFileSync(path.join(packs, "python-api", "notes", "en", "tech", "python.md"), "\nPack change.\n");

  const result = updatePack(vault, packs, "python-api");
  assert.deepEqual(result.proposed, []);
  assert.deepEqual(result.skipped, ["python"]);
  assert.equal(vault.listProposals().length, 0);
});

test("approveAll filters by pack version", () => {
  const vault = tempVault();
  installPack(vault, PACKS, "python-api");
  const python = vault.get("python");
  assert.ok(python);
  vault.propose("python", python.data, `${python.body}\nproposed`, {
    proposed_by: "pack:python-api@1.1.0",
    reason: "test",
  });

  assert.deepEqual(vault.approveAll({ pack: "python-api", version: "1.0.0" }), []);
  assert.deepEqual(vault.approveAll({ pack: "python-api", version: "1.1.0" }), ["python"]);
  assert.equal(vault.listProposals().length, 0);
});

test("updatePack throws when the pack is not installed", () => {
  assert.throws(() => updatePack(tempVault(), PACKS, "python-api"), /pack not installed/);
});
