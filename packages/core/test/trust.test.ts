import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { isTrusted, trust, trustPath, Vault } from "../src/index.js";

function tempVault(): Vault {
  return Vault.load(fs.mkdtempSync(path.join(os.tmpdir(), "basics-trust-")));
}

test("trust stores one hashed entry and creates the local-state gitignore", () => {
  const vault = tempVault();
  const dir = path.join(vault.root, "project");
  const command = 'node -e "process.exit(0)"';

  assert.equal(isTrusted(vault, dir, command), false);
  trust(vault, dir, command);
  assert.equal(isTrusted(vault, dir, command), true);
  assert.equal(fs.readFileSync(path.join(vault.root, ".basics", ".gitignore"), "utf8"), "*\n");

  const entries = JSON.parse(fs.readFileSync(trustPath(vault.root), "utf8")) as Record<
    string,
    { command: string; dir: string; at: string }
  >;
  assert.equal(Object.keys(entries).length, 1);
  const [entry] = Object.values(entries);
  assert.equal(entry.command, command);
  assert.equal(entry.dir, path.resolve(dir));
  assert.match(entry.at, /^\d{4}-\d{2}-\d{2}T/);
});

test("a different directory or command is untrusted again", () => {
  const vault = tempVault();
  const dir = path.join(vault.root, "project");
  const command = 'node -e "process.exit(0)"';
  trust(vault, dir, command);

  assert.equal(isTrusted(vault, path.join(vault.root, "other"), command), false);
  assert.equal(isTrusted(vault, dir, 'node -e "process.exit(1)"'), false);
  assert.equal(isTrusted(vault, dir, command), true);
});

test("isTrusted tolerates a missing or malformed trust file", () => {
  const vault = tempVault();
  assert.equal(isTrusted(vault, vault.root, "true"), false);
  fs.mkdirSync(path.join(vault.root, ".basics"), { recursive: true });
  fs.writeFileSync(trustPath(vault.root), "not json");
  assert.equal(isTrusted(vault, vault.root, "true"), false);
});
