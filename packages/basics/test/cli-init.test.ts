import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listPacks, packNotes, TYPE_DIRS, Vault } from "@marcozvd/basics-core";
import { test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const CLI = path.join(ROOT, "packages/basics/src/cli.ts");
const PACKS = path.join(ROOT, "packs");

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "basics-cli-"));
}

function runCli(args: string[], configFile: string): { status: number | null; stdout: string; stderr: string } {
  const env = { ...process.env, BASICS_CONFIG: configFile };
  delete env.BASICS_DIR;
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], { cwd: ROOT, env, encoding: "utf8", timeout: 60000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr || String(result.error ?? "") };
}

test("init --yes creates the vault, installs every pack and saves the config", () => {
  const dir = tempDir();
  const vaultDir = path.join(dir, "vault");
  const configFile = path.join(dir, "config.json");

  const result = runCli(["init", vaultDir, "--yes", "--lang", "es"], configFile);
  assert.equal(result.status, 0, result.stderr);
  for (const pack of listPacks(PACKS)) {
    const lines = result.stdout.split("\n").filter((line) => line.startsWith(`${pack.name}:`));
    assert.equal(lines.length, 1, `expected one install line for ${pack.name}`);
  }

  const update = runCli(["pack", "update"], configFile);
  assert.equal(update.status, 0, update.stderr);
  for (const pack of listPacks(PACKS)) assert.ok(update.stdout.includes(`${pack.name}: up to date (${pack.version})`));

  const vault = Vault.load(vaultDir);
  for (const pack of listPacks(PACKS)) {
    for (const note of packNotes(PACKS, pack.name, "es")) assert.ok(vault.get(note.id), `missing ${pack.name}/${note.id}`);
  }
  for (const typeDir of Object.values(TYPE_DIRS)) assert.ok(fs.statSync(path.join(vaultDir, typeDir)).isDirectory());
  assert.ok(fs.statSync(path.join(vaultDir, "inbox")).isDirectory());

  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  assert.equal(config.vault, path.resolve(vaultDir));
  assert.equal(config.language, "es");
}, 60000);

test("pack list shows the installed version of every pack", () => {
  const dir = tempDir();
  const vaultDir = path.join(dir, "vault");
  const configFile = path.join(dir, "config.json");

  const init = runCli(["init", vaultDir, "--yes", "--lang", "es"], configFile);
  assert.equal(init.status, 0, init.stderr);

  const result = runCli(["pack", "list"], configFile);
  assert.equal(result.status, 0, result.stderr);
  for (const pack of listPacks(PACKS)) {
    const line = result.stdout.split("\n").find((l) => l.startsWith(pack.name));
    assert.ok(line, `missing row for ${pack.name}`);
    assert.ok(line.includes(pack.version), `missing version for ${pack.name}: ${line}`);
    assert.ok(line.includes("1.0.0"), `missing installed version for ${pack.name}: ${line}`);
  }
}, 60000);

test("pack install core-layers works on a fresh vault", () => {
  const dir = tempDir();
  const vaultDir = path.join(dir, "vault");
  const configFile = path.join(dir, "config.json");
  fs.mkdirSync(vaultDir);
  fs.writeFileSync(configFile, JSON.stringify({ vault: vaultDir, language: "en" }));

  const result = runCli(["pack", "install", "core-layers"], configFile);
  assert.equal(result.status, 0, result.stderr);

  const vault = Vault.load(vaultDir);
  for (const note of packNotes(PACKS, "core-layers", "en")) assert.ok(vault.get(note.id), `missing ${note.id}`);
  assert.equal(vault.get("backend")?.data.source, "pack:core-layers@1.0.0");
}, 60000);
