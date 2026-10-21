import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { installedPacks, installPack, listPacks, NotFoundError, noteSchema, packNotes, readPack, Vault } from "../src/index.js";

const PACKS = path.resolve(import.meta.dirname, "../../../packs");

function emptyVault(): Vault {
  return Vault.load(fs.mkdtempSync(path.join(os.tmpdir(), "basics-packs-")));
}

test("listPacks returns the four packs with nothing installed on an empty vault", () => {
  const packs = listPacks(PACKS, emptyVault());
  assert.deepEqual(
    packs.map((p) => p.name),
    ["core-layers", "profiles", "python-api", "web-typescript"],
  );
  assert.ok(packs.every((p) => p.installed === null));
  assert.ok(packs.every((p) => p.notes > 0));
});

test("installPack installs required packs first and stamps the source", () => {
  const v = emptyVault();
  const result = installPack(v, PACKS, "python-api");
  assert.ok(result.installed.includes("python"));
  assert.ok(result.installed.includes("backend"));
  assert.equal(v.get("python")?.data.source, "pack:python-api@1.0.0");
  assert.equal(v.get("backend")?.data.source, "pack:core-layers@1.0.0");
  assert.deepEqual(v.issues, []);
});

test("a second install skips every existing id", () => {
  const v = emptyVault();
  const first = installPack(v, PACKS, "python-api");
  const second = installPack(v, PACKS, "python-api");
  assert.deepEqual(second.installed, []);
  assert.deepEqual(second.skipped.sort(), first.installed.sort());
});

test("installedPacks reports every pack with its version", () => {
  const v = emptyVault();
  installPack(v, PACKS, "profiles");
  assert.deepEqual(installedPacks(v), {
    "core-layers": "1.0.0",
    profiles: "1.0.0",
    "python-api": "1.0.0",
    "web-typescript": "1.0.0",
  });
});

test("an unknown pack throws NotFoundError", () => {
  assert.throws(() => readPack(PACKS, "nope"), NotFoundError);
  assert.throws(() => installPack(emptyVault(), PACKS, "nope"), NotFoundError);
});

test("every pack note validates with the schema", () => {
  for (const pack of listPacks(PACKS)) {
    for (const lang of readPack(PACKS, pack.name).languages) {
      const notes = packNotes(PACKS, pack.name, lang);
      assert.ok(notes.length > 0);
      for (const note of notes) assert.equal(noteSchema.safeParse(note.data).success, true);
    }
  }
});
