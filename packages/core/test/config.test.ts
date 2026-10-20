import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "vitest";
import { configPath, DEFAULT_VAULT, expandHome, loadConfig, resolveVaultDir, saveConfig, Vault, VaultNotFoundError } from "../src/index.js";

let dir: string;
let savedConfig: string | undefined;
let savedDir: string | undefined;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-config-"));
  savedConfig = process.env.BASICS_CONFIG;
  savedDir = process.env.BASICS_DIR;
  process.env.BASICS_CONFIG = path.join(dir, "config.json");
  delete process.env.BASICS_DIR;
});

afterEach(() => {
  if (savedConfig === undefined) delete process.env.BASICS_CONFIG;
  else process.env.BASICS_CONFIG = savedConfig;
  if (savedDir === undefined) delete process.env.BASICS_DIR;
  else process.env.BASICS_DIR = savedDir;
  fs.rmSync(dir, { recursive: true, force: true });
});

test("missing config file yields defaults", () => {
  const cfg = loadConfig();
  assert.equal(cfg.language, "en");
  assert.equal(cfg.embeddings, false);
});

test("vault resolution follows explicit > BASICS_DIR > config > default", () => {
  saveConfig({ language: "en", embeddings: false, vault: "~/from-config" });
  process.env.BASICS_DIR = "~/from-env";

  assert.equal(resolveVaultDir("~/explicit"), path.join(os.homedir(), "explicit"));
  assert.equal(resolveVaultDir(), path.join(os.homedir(), "from-env"));
  delete process.env.BASICS_DIR;
  assert.equal(resolveVaultDir(), path.join(os.homedir(), "from-config"));
  fs.rmSync(configPath(), { force: true });
  assert.equal(resolveVaultDir(), DEFAULT_VAULT);
});

test("expandHome expands ~ forms", () => {
  assert.equal(expandHome("~/x"), path.join(os.homedir(), "x"));
  assert.equal(expandHome("~\\x"), path.join(os.homedir(), "x"));
  assert.equal(expandHome("~"), os.homedir());
  assert.equal(expandHome("plain"), "plain");
});

test("invalid JSON throws an Invalid config error", () => {
  fs.writeFileSync(configPath(), "{ not json");
  assert.throws(() => loadConfig(), /Invalid config/);
});

test("Vault.load on a missing dir throws VaultNotFoundError", () => {
  assert.throws(() => Vault.load(path.join(dir, "missing")), VaultNotFoundError);
});
