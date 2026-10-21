import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type NoteData, Vault } from "@marcozvd/basics-core";
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

function seedVault(dir: string): string {
  const vaultDir = path.join(dir, "vault");
  if (!fs.existsSync(vaultDir)) fs.cpSync(VAULT, vaultDir, { recursive: true });
  return vaultDir;
}

function writeConfig(dir: string, vault?: string): string {
  const configFile = path.join(dir, "config.json");
  fs.writeFileSync(configFile, JSON.stringify({ vault: vault ?? seedVault(dir), language: "en" }));
  return configFile;
}

/** Copy of the seed vault whose FastAPI check carries a file template. */
function templateVault(dir: string): string {
  const vaultDir = path.join(dir, "vault");
  fs.cpSync(VAULT, vaultDir, { recursive: true });
  const vault = Vault.load(vaultDir);
  const check = vault.get("fastapi-endpoint-tests");
  assert.ok(check);
  vault.writeNote(check.id, check.data, `${check.body}\n\n\`\`\`python file=tests/test_health.py\nprint("ok")\n\`\`\``);
  return vaultDir;
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
    project: "project",
  });
  const vault = Vault.load(seedVault(dir));
  const projectNote = vault.get("project");
  assert.equal(projectNote?.data.type, "project");
  const projectData = projectNote?.data as Extract<NoteData, { type: "project" }>;
  assert.equal(projectData.path, path.resolve(project));
  assert.deepEqual(projectData.stack, { backend: ["fastapi"], frontend: ["react"] });
  assert.equal(projectData.status, "active");
  assert.equal(projectData.source, "manual");

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
    project: "project",
  });

  const dry = runCli(["export", project, "--dry-run"], configFile);
  assert.equal(dry.status, 0, dry.stderr);
  assert.ok(dry.stdout.includes("STACK.md: unchanged"), dry.stdout);
  assert.ok(dry.stdout.includes("AGENTS.md: unchanged"), dry.stdout);
}, 30000);

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

test("detect prints JSON and export --detect merges ids and versions", () => {
  const dir = tempDir();
  const project = path.join(dir, "project");
  const configFile = writeConfig(dir);
  fs.mkdirSync(project);
  fs.writeFileSync(
    path.join(project, "package.json"),
    JSON.stringify({ dependencies: { react: "^19.0.0" }, devDependencies: { typescript: "^5.9.0", vite: "^8.0.0" } }),
  );
  fs.writeFileSync(path.join(project, "basics.json"), JSON.stringify({ stack: ["fastapi"], targets: ["agents"] }));

  const detected = runCli(["detect", project, "--json"], configFile);
  assert.equal(detected.status, 0, detected.stderr);
  const result = JSON.parse(detected.stdout) as {
    techs: { id: string; version?: string }[];
    unknown: { name: string }[];
    files: string[];
  };
  assert.deepEqual(result.files, ["package.json"]);
  assert.deepEqual(
    result.techs.map((tech) => [tech.id, tech.version]),
    [
      ["react", "19.0.0"],
      ["typescript", "5.9.0"],
    ],
  );
  assert.deepEqual(
    result.unknown.map((pkg) => pkg.name),
    ["vite"],
  );

  const exported = runCli(["export", project, "--detect"], configFile);
  assert.equal(exported.status, 0, exported.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project, "basics.json"), "utf8")), {
    stack: ["fastapi", "react", "typescript"],
    targets: ["agents"],
    project: "project",
    versions: { react: "19.0.0", typescript: "5.9.0" },
  });
  assert.ok(fs.readFileSync(path.join(project, "STACK.md"), "utf8").includes("React"));
}, 30000);

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

test("export --templates writes missing files and never overwrites", () => {
  const dir = tempDir();
  const project = path.join(dir, "project");
  const configFile = writeConfig(dir, templateVault(dir));

  const first = runCli(["export", project, "-s", "fastapi", "-t", "agents", "--templates"], configFile);
  assert.equal(first.status, 0, first.stderr);
  assert.ok(first.stdout.includes("wrote tests/test_health.py"), first.stdout);
  const file = path.join(project, "tests/test_health.py");
  assert.ok(fs.existsSync(file));
  assert.ok(fs.readFileSync(file, "utf8").includes('print("ok")'));

  fs.writeFileSync(file, "# local edit\n");
  const second = runCli(["export", project, "--templates"], configFile);
  assert.equal(second.status, 0, second.stderr);
  assert.ok(second.stdout.includes("skipped tests/test_health.py (exists)"), second.stdout);
  assert.equal(fs.readFileSync(file, "utf8"), "# local edit\n");
});

test("export --templates --dry-run writes nothing", () => {
  const dir = tempDir();
  const project = path.join(dir, "missing");
  const configFile = writeConfig(dir, templateVault(dir));

  const result = runCli(["export", project, "-s", "fastapi", "--dry-run", "--templates"], configFile);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("would write tests/test_health.py"), result.stdout);
  assert.equal(fs.existsSync(project), false);
});

test("export without --templates leaves template files alone", () => {
  const dir = tempDir();
  const project = path.join(dir, "project");
  const configFile = writeConfig(dir, templateVault(dir));

  const result = runCli(["export", project, "-s", "fastapi", "-t", "agents"], configFile);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.existsSync(path.join(project, "tests/test_health.py")), false);
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
