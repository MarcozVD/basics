import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Vault } from "@marcozvd/basics-core";
import { test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const CLI = path.join(ROOT, "packages/basics/src/cli.ts");

function runCli(args: string[], configFile: string, cache: string): { status: number | null; stdout: string; stderr: string } {
  const env = { ...process.env, BASICS_CONFIG: configFile, BASICS_CACHE: cache };
  delete env.BASICS_DIR;
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], { cwd: ROOT, env, encoding: "utf8", timeout: 60000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr || String(result.error ?? "") };
}

test("embeddings status works without the runtime", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-embeddings-cli-"));
  try {
    const vaultDir = path.join(dir, "vault");
    const cache = path.join(dir, "cache");
    const configFile = path.join(dir, "config.json");
    fs.mkdirSync(vaultDir);
    const vault = Vault.load(vaultDir);
    vault.writeNote(
      "fastapi",
      {
        type: "tech",
        kind: "framework",
        layer: "backend",
        use_when: ["REST APIs"],
        tags: [],
        source: "manual",
      },
      "# FastAPI",
    );
    fs.writeFileSync(configFile, JSON.stringify({ vault: vaultDir, language: "en" }));

    const result = runCli(["embeddings", "status"], configFile, cache);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /embeddings: off/);
    assert.match(result.stdout, /runtime: missing/);
    assert.match(result.stdout, /model cache: missing/);
    assert.match(result.stdout, /index: 0 notes.*stale 1/);
    assert.equal(fs.existsSync(path.join(cache, "embeddings")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("embeddings enable aborts without a TTY and without --yes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-embeddings-cli-"));
  try {
    const vaultDir = path.join(dir, "vault");
    const cache = path.join(dir, "cache");
    const configFile = path.join(dir, "config.json");
    fs.mkdirSync(vaultDir);
    Vault.load(vaultDir);
    fs.writeFileSync(configFile, JSON.stringify({ vault: vaultDir, language: "en" }));

    const result = runCli(["embeddings", "enable"], configFile, cache);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--yes/);
    assert.equal(fs.existsSync(path.join(cache, "embeddings")), false);
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    assert.equal(config.embeddings ?? false, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
