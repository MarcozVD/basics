import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const CLI = path.join(ROOT, "packages/basics/src/cli.ts");
const VAULT = path.join(ROOT, "examples/vault");

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "basics-export-"));
}

function runCli(args: string[], configFile: string): { status: number | null; stdout: string; stderr: string } {
  const env = { ...process.env, BASICS_CONFIG: configFile };
  delete env.BASICS_DIR;
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], { cwd: ROOT, env, encoding: "utf8", timeout: 60000 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr || String(result.error ?? "") };
}

function writeConfig(dir: string): string {
  const configFile = path.join(dir, "config.json");
  fs.writeFileSync(configFile, JSON.stringify({ vault: VAULT, language: "en" }));
  return configFile;
}

test("export writes the files and basics.json, then reuses it without flags", () => {
  const dir = tempDir();
  const project = path.join(dir, "project");
  const configFile = writeConfig(dir);

  const first = runCli(["export", project, "-s", "fastapi,react", "-t", "agents,claude,cursor"], configFile);
  assert.equal(first.status, 0, first.stderr);
  for (const file of ["STACK.md", "AGENTS.md", "CLAUDE.md", ".cursor/rules/stack.mdc", "basics.json"]) {
    assert.ok(fs.existsSync(path.join(project, file)), `missing ${file}`);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, "basics.json"), "utf8")), {
    stack: ["fastapi", "react"],
    targets: ["agents", "claude", "cursor"],
  });
  const agents = fs.readFileSync(path.join(project, "AGENTS.md"), "utf8");
  assert.ok(agents.includes("<!-- basics:start -->"));
  assert.ok(agents.includes("backend: fastapi"));
  assert.ok(agents.includes("frontend: react"));

  const second = runCli(["export", project], configFile);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(fs.readFileSync(path.join(project, "AGENTS.md"), "utf8"), agents);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, "basics.json"), "utf8")), {
    stack: ["fastapi", "react"],
    targets: ["agents", "claude", "cursor"],
  });

  const dry = runCli(["export", project, "--dry-run"], configFile);
  assert.equal(dry.status, 0, dry.stderr);
  assert.ok(dry.stdout.includes("STACK.md: unchanged"), dry.stdout);
  assert.ok(dry.stdout.includes("AGENTS.md: unchanged"), dry.stdout);
});

test("export --dry-run writes nothing", () => {
  const dir = tempDir();
  const project = path.join(dir, "missing");
  const configFile = writeConfig(dir);

  const result = runCli(["export", project, "-s", "fastapi", "--dry-run"], configFile);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("STACK.md: would change"), result.stdout);
  assert.ok(result.stdout.includes("AGENTS.md: would change"), result.stdout);
  assert.equal(fs.existsSync(project), false);
});

test("export saves normalized, deduped tech ids", () => {
  const dir = tempDir();
  const project = path.join(dir, "project");
  const configFile = writeConfig(dir);

  const result = runCli(["export", project, "-s", "[[FastAPI]],react,react", "-t", "agents"], configFile);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, "basics.json"), "utf8")).stack, ["fastapi", "react"]);
});

test("export errors without a stack and without basics.json", () => {
  const dir = tempDir();
  const project = path.join(dir, "project");
  const configFile = writeConfig(dir);

  const result = runCli(["export", project], configFile);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes("no stack configured"), result.stderr);
});

test("--version prints the package version", () => {
  const dir = tempDir();
  const configFile = writeConfig(dir);
  const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/basics/package.json"), "utf8")) as { version: string };

  const result = runCli(["--version"], configFile);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), version);
});

test("init-project stays as a deprecated alias for the agents target", () => {
  const dir = tempDir();
  const project = path.join(dir, "project");
  const configFile = writeConfig(dir);

  const result = runCli(["init-project", project, "-s", "fastapi"], configFile);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("init-project is deprecated"), result.stdout);
  assert.ok(fs.existsSync(path.join(project, "STACK.md")));
  assert.ok(fs.existsSync(path.join(project, "AGENTS.md")));
  assert.equal(fs.existsSync(path.join(project, "CLAUDE.md")), false);
});
