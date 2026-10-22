import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const CLI = path.join(ROOT, "packages/basics/src/cli.ts");

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "basics-doctor-"));
}

function runCli(args: string[], configFile: string, extraEnv: Record<string, string> = {}): RunResult {
  const env = { ...process.env, BASICS_CONFIG: configFile, ...extraEnv };
  delete env.BASICS_DIR;
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], { cwd: ROOT, env, encoding: "utf8", timeout: 60000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr || String(result.error ?? "") };
}

/** Fresh vault created by `basics init`, which now writes basics.vault.json and .basics/.gitignore. */
function initVault(dir: string): { vaultDir: string; configFile: string } {
  const vaultDir = path.join(dir, "vault");
  const configFile = path.join(dir, "config.json");
  const result = runCli(["init", vaultDir, "--yes", "--packs", "none"], configFile);
  assert.equal(result.status, 0, result.stderr);
  return { vaultDir, configFile };
}

function plainVault(dir: string): { vaultDir: string; configFile: string } {
  const vaultDir = path.join(dir, "vault");
  const configFile = path.join(dir, "config.json");
  fs.mkdirSync(vaultDir);
  fs.writeFileSync(configFile, JSON.stringify({ vault: vaultDir, language: "en" }));
  return { vaultDir, configFile };
}

function assertUserError(result: RunResult): void {
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /^error: .+/m);
  assert.match(result.stderr, /^hint: .+/m);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("doctor reports a freshly initialized vault as healthy", () => {
  const dir = tempDir();
  try {
    const { configFile } = initVault(dir);
    const result = runCli(["doctor"], configFile);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /0 warn, 0 fail/);
    for (const id of ["node", "config", "vault", "vault schema", ".basics", "inbox", "packs", "embeddings", "port"]) {
      assert.match(result.stdout, new RegExp(`^ok\\s+${escapeRegExp(id)}\\s`, "m"), `expected ok line for ${id}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 60000);

test("doctor warns about missing meta and gitignore, and --fix repairs them", () => {
  const dir = tempDir();
  try {
    const { vaultDir, configFile } = plainVault(dir);
    const meta = path.join(vaultDir, "basics.vault.json");
    const gitignore = path.join(vaultDir, ".basics", ".gitignore");

    const before = runCli(["doctor"], configFile);
    assert.equal(before.status, 0, before.stderr);
    assert.match(before.stdout, /^warn\s+vault schema\s+basics\.vault\.json is missing/m);
    assert.match(before.stdout, /^warn\s+\.basics\s+.*\.gitignore missing/m);
    assert.match(before.stdout, /2 warn, 0 fail/);

    const fixed = runCli(["doctor", "--fix"], configFile);
    assert.equal(fixed.status, 0, fixed.stderr);
    assert.match(fixed.stdout, /fixed: wrote .*basics\.vault\.json \(schema v1\)/);
    assert.match(fixed.stdout, /fixed: created .*\.gitignore/);
    assert.deepEqual(JSON.parse(fs.readFileSync(meta, "utf8")), { schemaVersion: 1 });
    assert.equal(fs.readFileSync(gitignore, "utf8"), "*\n");

    const after = runCli(["doctor"], configFile);
    assert.equal(after.status, 0, after.stderr);
    assert.match(after.stdout, /0 warn, 0 fail/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 60000);

test("doctor --json prints the result array", () => {
  const dir = tempDir();
  try {
    const { configFile } = initVault(dir);
    const result = runCli(["doctor", "--json"], configFile);
    assert.equal(result.status, 0, result.stderr);

    const checks = JSON.parse(result.stdout) as { id: string; status: string; message: string }[];
    assert.ok(Array.isArray(checks));
    assert.equal(checks.length, 9);
    for (const check of checks) {
      assert.equal(typeof check.id, "string");
      assert.ok(["ok", "warn", "fail"].includes(check.status), check.status);
      assert.equal(typeof check.message, "string");
    }
    assert.equal(checks.find((check) => check.id === "vault")?.status, "ok");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 60000);

test("validate warns about old vaults and errors on newer schemas", () => {
  const dir = tempDir();
  try {
    const { vaultDir, configFile } = initVault(dir);
    const meta = path.join(vaultDir, "basics.vault.json");

    fs.rmSync(meta);
    const missing = runCli(["validate"], configFile);
    assert.equal(missing.status, 0, missing.stderr);
    assert.match(missing.stdout, /warning: .*basics\.vault\.json is missing/);

    fs.writeFileSync(meta, JSON.stringify({ schemaVersion: 99 }));
    const newer = runCli(["validate"], configFile);
    assert.equal(newer.status, 1);
    assert.match(newer.stderr, /error: .*written by a newer basics/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 60000);

test("user-facing errors print error and hint lines without a stack", () => {
  const dir = tempDir();
  try {
    const missingConfig = path.join(dir, "missing-config.json");
    fs.writeFileSync(missingConfig, JSON.stringify({ vault: path.join(dir, "nope"), language: "en" }));
    const noVault = runCli(["list"], missingConfig);
    assertUserError(noVault);
    assert.match(noVault.stderr, /error: Vault not found/);
    assert.match(noVault.stderr, /hint: run `basics init` or pass --vault/);

    const { vaultDir, configFile } = initVault(dir);

    const badPack = runCli(["pack", "install", "nope"], configFile);
    assertUserError(badPack);
    assert.match(badPack.stderr, /error: unknown pack "nope"/);

    const badKey = runCli(["config", "set", "nope", "1"], configFile);
    assertUserError(badKey);
    assert.match(badKey.stderr, /error: unknown config key "nope"/);

    const badProposal = runCli(["inbox", "show", "nope"], configFile);
    assertUserError(badProposal);
    assert.match(badProposal.stderr, /error: no proposal "nope"/);

    const project = path.join(dir, "project");
    fs.mkdirSync(project);
    const noSettings = runCli(["check", project], configFile);
    assertUserError(noSettings);
    assert.match(noSettings.stderr, /hint: run `basics export --stack <ids>`/);

    const badTech = runCli(["export", project, "--stack", "nope", "--dry-run"], configFile);
    assertUserError(badTech);
    assert.match(badTech.stderr, /error: unknown tech ids: nope/);
    assert.match(badTech.stderr, /hint: run `basics list --type tech`/);

    const cache = path.join(dir, "cache");
    const noRuntime = runCli(["embeddings", "reindex"], configFile, { BASICS_CACHE: cache });
    assertUserError(noRuntime);
    assert.match(noRuntime.stderr, /hint: run `basics embeddings enable`/);

    assert.ok(fs.existsSync(vaultDir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 120000);

test("basics ui reports a port already in use with a --port hint", async () => {
  const dir = tempDir();
  const server = net.createServer();
  try {
    const { configFile } = initVault(dir);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");

    const result = runCli(["ui", "--port", String(address.port), "--no-open"], configFile);
    assertUserError(result);
    assert.match(result.stderr, /error: port \d+ is already in use/);
    assert.match(result.stderr, /hint: pass --port <n>/);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 120000);
