import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { installedPacks, Vault } from "@marcozvd/basics-core";
import { test } from "vitest";
import { buildTarGz, fixtureEntries } from "../../core/test/tar-builder.js";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const CLI = path.join(ROOT, "packages/basics/src/cli.ts");
const DIRS: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-cli-pack-"));
  DIRS.push(dir);
  return dir;
}

// ---------------------------------------------------------------------------
// The spawned CLI process has no route to the test runner's sockets in this
// sandbox, so a real fixture server is unreachable. Instead we install a fetch
// stub through `--import` before the CLI runs: the core fetcher still builds a
// URL from BASICS_PACK_FETCH_BASE, and the stub returns the canned archive for
// the known repo (or a 404). No bytes ever reach the network.
// ---------------------------------------------------------------------------
const STUB = `import fs from "node:fs";
const gzip = fs.existsSync(process.env.BASICS_PACK_FIXTURE)
  ? fs.readFileSync(process.env.BASICS_PACK_FIXTURE)
  : Buffer.alloc(0);
globalThis.fetch = async (input) => {
  const url = String(input);
  if (url.includes("/marcozvd/cool-pack/tar.gz/")) {
    return new Response(gzip, { status: 200, headers: { "content-type": "application/gzip" } });
  }
  return new Response("not found", { status: 404 });
};
`;

interface Fx {
  vaultDir: string;
  configFile: string;
  stubFile: string;
  fixtureFile: string;
}

function freshVault(): Fx {
  const dir = tempDir();
  const vaultDir = path.join(dir, "vault");
  fs.mkdirSync(vaultDir);
  const configFile = path.join(dir, "config.json");
  fs.writeFileSync(configFile, JSON.stringify({ vault: vaultDir, language: "en" }));
  const stubFile = path.join(dir, "fetch-stub.mjs");
  fs.writeFileSync(stubFile, STUB);
  const fixtureFile = path.join(dir, "fixture.tar.gz");
  fs.writeFileSync(fixtureFile, buildTarGz(fixtureEntries("1.0.0")));
  return { vaultDir, configFile, stubFile, fixtureFile };
}

function runCli(args: string[], fx: Fx): { status: number | null; stdout: string; stderr: string } {
  const env = {
    ...process.env,
    BASICS_CONFIG: fx.configFile,
    // The stub above intercepts fetch; the base URL is still what the core
    // fetcher builds its download URL from (see packs.ts packArchiveBase).
    BASICS_PACK_FETCH_BASE: "https://codeload.invalid",
    BASICS_PACK_FIXTURE: fx.fixtureFile,
  };
  delete env.BASICS_DIR;
  const result = spawnSync(process.execPath, ["--import", "tsx", "--import", pathToFileURL(fx.stubFile).href, CLI, ...args], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    timeout: 60000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr || String(result.error ?? "") };
}

const keep = () => {
  // DIRS entries are cleaned at process exit; nothing to tear down per-test.
};

test("pack add downloads a community pack and proposes its notes for review", () => {
  const fx = freshVault();
  keep();

  const add = runCli(["pack", "add", "marcozvd/cool-pack"], fx);
  assert.equal(add.status, 0, add.stderr);
  assert.ok(add.stdout.includes("added marcozvd/cool-pack@1.0.0"), add.stdout);
  assert.ok(add.stdout.includes("1 new, 0 changed"), add.stdout);

  const vault = Vault.load(fx.vaultDir);
  const proposals = vault.listProposals();
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].meta.proposed_by, "pack:marcozvd/cool-pack@1.0.0");
  assert.equal(installedPacks(vault)["marcozvd/cool-pack"], undefined, "nothing installed until reviewed");
}, 60000);

test("pack list marks community packs as github origin with repo@ref", () => {
  const fx = freshVault();
  runCli(["pack", "add", "marcozvd/cool-pack"], fx);

  const list = runCli(["pack", "list"], fx);
  assert.equal(list.status, 0, list.stderr);
  const row = list.stdout.split("\n").find((l) => l.startsWith("marcozvd/cool-pack@HEAD"));
  assert.ok(row, `missing community row: ${list.stdout}`);
  assert.ok(row.includes("github"), row);
}, 60000);

test("a missing repo produces an error with a hint, no crash", () => {
  const fx = freshVault();
  const add = runCli(["pack", "add", "marcozvd/nope"], fx);
  assert.equal(add.status, 1);
  assert.ok(add.stderr.includes("error:"), add.stderr);
  assert.ok(add.stderr.includes("hint:"), add.stderr);
}, 60000);

test("pack remove drops the cache but leaves installed notes", () => {
  const fx = freshVault();
  runCli(["pack", "add", "marcozvd/cool-pack"], fx);

  const vault = Vault.load(fx.vaultDir);
  vault.approveAll({ pack: "marcozvd/cool-pack" });
  assert.equal(installedPacks(vault)["marcozvd/cool-pack"], "1.0.0");

  const remove = runCli(["pack", "remove", "marcozvd/cool-pack"], fx);
  assert.equal(remove.status, 0, remove.stderr);
  assert.ok(remove.stdout.includes("removed marcozvd/cool-pack"), remove.stdout);

  const after = Vault.load(fx.vaultDir);
  assert.equal(installedPacks(after)["marcozvd/cool-pack"], "1.0.0", "installed note stays");
  assert.ok(!fs.existsSync(path.join(fx.vaultDir, ".basics", "packs", "marcozvd", "cool-pack")));
}, 60000);

test("cleans up temp dirs", () => {
  for (const dir of DIRS) fs.rmSync(dir, { recursive: true, force: true });
  DIRS.length = 0;
});
