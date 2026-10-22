import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { CURRENT_SCHEMA_VERSION, checkVaultMeta, readVaultMeta, Vault, vaultMetaPath, writeVaultMeta } from "../src/index.js";

function tempVault(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "basics-meta-"));
}

test("writeVaultMeta writes the committed schema file", () => {
  const root = tempVault();
  writeVaultMeta(root);

  assert.deepEqual(JSON.parse(fs.readFileSync(vaultMetaPath(root), "utf8")), { schemaVersion: CURRENT_SCHEMA_VERSION });
  assert.deepEqual(readVaultMeta(root), { schemaVersion: CURRENT_SCHEMA_VERSION });
  assert.deepEqual(fs.readdirSync(root), ["basics.vault.json"]);
});

test("readVaultMeta returns null when the file is missing or invalid", () => {
  const root = tempVault();
  assert.equal(readVaultMeta(root), null);

  fs.writeFileSync(vaultMetaPath(root), "not json");
  assert.equal(readVaultMeta(root), null);

  fs.writeFileSync(vaultMetaPath(root), JSON.stringify({ schemaVersion: "1" }));
  assert.equal(readVaultMeta(root), null);
});

test("checkVaultMeta warns when the schema file is missing or older", () => {
  const root = tempVault();
  assert.equal(checkVaultMeta(root).status, "warn");

  fs.writeFileSync(vaultMetaPath(root), `${JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION - 1 })}\n`);
  const older = checkVaultMeta(root);
  assert.equal(older.status, "warn");
  assert.match(older.message, /older/);
});

test("checkVaultMeta errors when the vault was written by a newer basics", () => {
  const root = tempVault();
  fs.writeFileSync(vaultMetaPath(root), `${JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION + 1 })}\n`);

  const check = checkVaultMeta(root);
  assert.equal(check.status, "error");
  assert.match(check.message, /written by a newer basics/);
  assert.match(check.message, /upgrade/);
});

test("checkVaultMeta is ok for the current schema", () => {
  const root = tempVault();
  writeVaultMeta(root);
  assert.deepEqual(checkVaultMeta(root), { status: "ok", message: `vault schema v${CURRENT_SCHEMA_VERSION}` });
});

test("Vault.load does not require basics.vault.json", () => {
  const root = tempVault();
  assert.doesNotThrow(() => Vault.load(root));
  assert.equal(fs.existsSync(vaultMetaPath(root)), false);
});
