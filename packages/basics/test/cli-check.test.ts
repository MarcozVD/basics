import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type NoteData, Vault } from "@marcozvd/basics-core";
import { test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const CLI = path.join(ROOT, "packages/basics/src/cli.ts");

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "basics-check-"));
}

function runCli(args: string[], configFile: string): { status: number | null; stdout: string; stderr: string } {
  const env = { ...process.env, BASICS_CONFIG: configFile };
  delete env.BASICS_DIR;
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], { cwd: ROOT, env, encoding: "utf8", timeout: 60000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr || String(result.error ?? "") };
}

interface Setup {
  project: string;
  vaultDir: string;
  configFile: string;
}

function setup(dir: string, commands: Record<string, string>, opts: { project?: boolean } = {}): Setup {
  const vaultDir = path.join(dir, "vault");
  fs.mkdirSync(vaultDir);
  const vault = Vault.load(vaultDir);
  vault.writeNote(
    "fastapi",
    {
      type: "tech",
      kind: "framework",
      layer: "backend",
      checks: Object.keys(commands).map((id) => `check-${id}`),
      tags: [],
      source: "manual",
    },
    "# FastAPI",
  );
  for (const [id, command] of Object.entries(commands)) {
    vault.writeNote(`check-${id}`, { type: "check", kind: "test", applies_to: [], command, tags: [], source: "manual" }, "# Check");
  }
  const project = path.join(dir, "project");
  fs.mkdirSync(project);
  const basics = { stack: ["fastapi"], targets: ["agents"], ...(opts.project ? { project: "project" } : {}) };
  fs.writeFileSync(path.join(project, "basics.json"), JSON.stringify(basics, null, 2));
  if (opts.project) {
    vault.writeNote(
      "project",
      {
        type: "project",
        status: "active",
        path: project,
        stack: { backend: ["fastapi"] },
        tags: [],
        source: "manual",
      },
      "# Project",
    );
  }
  const configFile = path.join(dir, "config.json");
  fs.writeFileSync(configFile, JSON.stringify({ vault: vaultDir, language: "en" }));
  return { project, vaultDir, configFile };
}

test("check reports untrusted checks without a TTY", () => {
  const dir = tempDir();
  const { project, vaultDir, configFile } = setup(dir, { exit0: 'node -e "process.exit(0)"', exit1: 'node -e "process.exit(1)"' });

  const run = runCli(["check", project], configFile);
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.match(/untrusted/g)?.length, 2, run.stdout);
  assert.equal(fs.existsSync(path.join(vaultDir, ".basics", "trust.json")), false);

  const strict = runCli(["check", project, "--strict"], configFile);
  assert.equal(strict.status, 1, strict.stdout);
});

test("--trust runs the checks, records pass and persists trust", () => {
  const dir = tempDir();
  const { project, vaultDir, configFile } = setup(dir, { exit0: 'node -e "process.exit(0)"' }, { project: true });

  const first = runCli(["check", project, "--trust"], configFile);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(first.stdout.includes("exit0"), first.stdout);
  assert.ok(first.stdout.includes("pass"), first.stdout);
  assert.ok(fs.existsSync(path.join(vaultDir, ".basics", "trust.json")));

  const second = runCli(["check", project], configFile);
  assert.equal(second.status, 0, second.stderr);
  assert.ok(second.stdout.includes("pass"), second.stdout);

  const listed = runCli(["check", project, "--list"], configFile);
  assert.equal(listed.status, 0, listed.stderr);
  assert.ok(listed.stdout.includes('node -e "process.exit(0)"'), listed.stdout);
  assert.ok(listed.stdout.includes("yes"), listed.stdout);
});

test("a failing check exits 1 and stores last_checks on the project note", () => {
  const dir = tempDir();
  const command = `node -e "console.error('boom'); process.exit(1)"`;
  const { project, vaultDir, configFile } = setup(dir, { failing: command }, { project: true });

  const run = runCli(["check", project, "--trust"], configFile);
  assert.equal(run.status, 1, run.stdout);
  assert.ok(run.stdout.includes("fail"), run.stdout);

  const note = Vault.load(vaultDir).get("project");
  assert.equal(note?.data.type, "project");
  const data = note?.data as Extract<NoteData, { type: "project" }>;
  const last = data.last_checks?.["check-failing"];
  assert.equal(last?.status, "fail");
  assert.ok(last?.output_tail?.includes("boom"), last?.output_tail);
  assert.equal(typeof last?.duration_ms, "number");
  assert.match(last?.at ?? "", /^\d{4}-\d{2}-\d{2}T/);
});

test("--only runs just the selected check", () => {
  const dir = tempDir();
  const { project, configFile } = setup(dir, { exit0: 'node -e "process.exit(0)"', exit1: 'node -e "process.exit(1)"' }, { project: true });

  const run = runCli(["check", project, "--trust", "--only", "check-exit0"], configFile);
  assert.equal(run.status, 0, run.stdout);
  assert.ok(run.stdout.includes("check-exit0"), run.stdout);
  assert.equal(run.stdout.includes("check-exit1"), false);
});

test("check errors when basics.json is missing", () => {
  const dir = tempDir();
  const { project, configFile } = setup(dir, { exit0: 'node -e "process.exit(0)"' });
  fs.rmSync(path.join(project, "basics.json"));

  const run = runCli(["check", project], configFile);
  assert.equal(run.status, 1);
  assert.ok(run.stderr.includes("basics export"), run.stderr);
});
