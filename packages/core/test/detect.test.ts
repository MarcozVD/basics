import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { detectStack, inRange, installPack, stackContext, Vault } from "../src/index.js";

const PACKS = path.resolve(import.meta.dirname, "../../../packs");

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function vaultWith(...packs: string[]): Vault {
  const vault = Vault.load(tempDir("basics-detect-vault-"));
  for (const pack of packs) installPack(vault, PACKS, pack);
  return vault;
}

function project(files: Record<string, string>): string {
  const dir = tempDir("basics-detect-project-");
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

test("detectStack reads npm dependencies, maps packages and reports unknowns", () => {
  const vault = vaultWith("web-typescript");
  const dir = project({
    "package.json": JSON.stringify({
      dependencies: { next: "^15.1.0", react: "^19.0.0", "left-pad": "^1.3.0" },
      devDependencies: { typescript: "~5.9.3", "@types/node": "^22.0.0" },
    }),
  });

  const result = detectStack(vault, dir);
  assert.deepEqual(result.files, ["package.json"]);
  assert.deepEqual(
    result.techs.map((tech) => [tech.id, tech.version, tech.source]),
    [
      ["nextjs", "15.1.0", "package.json"],
      ["react", "19.0.0", "package.json"],
      ["typescript", "5.9.3", "package.json"],
    ],
  );
  assert.deepEqual(result.unknown, [{ ecosystem: "npm", name: "left-pad", version: "1.3.0" }]);
});

test("detectStack reads pyproject.toml project, optional and poetry dependencies", () => {
  const vault = vaultWith("python-api");
  const dir = project({
    "pyproject.toml": [
      "[project]",
      'requires-python = ">=3.11"',
      'dependencies = ["fastapi>=0.115.0,<1", "psycopg[binary]>=3.1", "requests>=2.31"]',
      "[project.optional-dependencies]",
      'dev = ["pytest~=8.2"]',
      "[tool.poetry.dependencies]",
      'python = "^3.11"',
      'Django = "^5.0"',
      "[tool.poetry.group.dev.dependencies]",
      'ruff = ">=0.6"',
    ].join("\n"),
  });

  const result = detectStack(vault, dir);
  assert.deepEqual(result.files, ["pyproject.toml"]);
  assert.deepEqual(
    result.techs.map((tech) => [tech.id, tech.version]),
    [
      ["fastapi", "0.115.0"],
      ["postgresql", undefined],
      ["pytest", "8.2.0"],
      ["python", "3.11.0"],
    ],
  );
  assert.deepEqual(
    result.unknown.map((pkg) => [pkg.name, pkg.version]),
    [
      ["requests", "2.31.0"],
      ["django", undefined],
      ["ruff", "0.6.0"],
    ],
  );
});

test("detectStack normalizes requirements names and reads both requirement files", () => {
  const vault = vaultWith("python-api");
  const dir = project({
    "requirements.txt": ["# runtime", "Django==5.0.4", "psycopg2_binary>=2.9", "-r other.txt"].join("\n"),
    "requirements-dev.txt": "pytest>=8\n",
  });

  const result = detectStack(vault, dir);
  assert.deepEqual(result.files, ["requirements.txt", "requirements-dev.txt"]);
  assert.deepEqual(
    result.techs.map((tech) => [tech.id, tech.version, tech.source]),
    [
      ["postgresql", undefined, "requirements.txt"],
      ["pytest", "8.0.0", "requirements-dev.txt"],
      ["python", undefined, "requirements.txt"],
    ],
  );
  assert.deepEqual(result.unknown, [{ ecosystem: "pypi", name: "django", version: "5.0.4" }]);
});

test("database techs do not take versions from client packages", () => {
  const vault = vaultWith("python-api");
  const dir = project({
    "package.json": JSON.stringify({ dependencies: { pg: "^8.11.0" } }),
    "requirements.txt": "psycopg[binary]>=3.1\nasyncpg>=0.29\n",
  });

  const result = detectStack(vault, dir);
  assert.deepEqual(
    result.techs.map((tech) => [tech.id, tech.version]),
    [
      ["postgresql", undefined],
      ["python", undefined],
    ],
  );
});

test("detectStack combines npm and Python manifests", () => {
  const vault = vaultWith("web-typescript", "python-api");
  const dir = project({
    "package.json": JSON.stringify({ dependencies: { react: "^19.2.0" } }),
    "pyproject.toml": '[project]\ndependencies = ["fastapi>=0.100"]\n',
  });

  const result = detectStack(vault, dir);
  assert.deepEqual(result.files, ["package.json", "pyproject.toml"]);
  assert.deepEqual(
    result.techs.map((tech) => tech.id),
    ["react", "fastapi", "python"],
  );
});

test("inRange treats versions as inclusive since and exclusive until", () => {
  assert.equal(inRange(undefined, "18", "20"), true);
  assert.equal(inRange("19.0.0", "18", "20"), true);
  assert.equal(inRange("17.9.0", "18"), false);
  assert.equal(inRange("20.0.0", undefined, "20"), false);
  assert.equal(inRange("19.9.9", undefined, "20"), true);
  assert.equal(inRange("not-a-version", "18", "20"), true);
  assert.equal(inRange("19", "18.5", "19.5"), true);
});

test("stackContext filters practices and checks by tech version", () => {
  const vault = Vault.load(tempDir("basics-detect-filter-"));
  vault.writeNote(
    "fastapi",
    {
      type: "tech",
      kind: "framework",
      layer: "backend",
      title: "FastAPI",
      use_when: [],
      avoid_when: [],
      performs_best: [],
      related: [],
      practices: ["p-linked"],
      checks: ["c-linked"],
      tags: [],
      source: "manual",
    },
    "# FastAPI",
  );
  vault.writeNote(
    "legacy",
    {
      type: "tech",
      kind: "framework",
      layer: "backend",
      title: "Legacy",
      use_when: [],
      avoid_when: [],
      performs_best: [],
      related: [],
      practices: ["p-legacy"],
      checks: [],
      tags: [],
      source: "manual",
    },
    "# Legacy",
  );
  const practice = (id: string, appliesTo: string[], since?: string, until?: string) =>
    vault.writeNote(id, { type: "practice", applies_to: appliesTo, since, until, tags: [], source: "manual" }, `# ${id}`);
  practice("p-old", ["fastapi"], "2", "3");
  practice("p-new", ["fastapi"], "3");
  practice("p-always", ["fastapi"]);
  practice("p-linked", [], "3");
  practice("p-legacy", ["legacy"]);
  practice("p-other", ["react"], "3");
  vault.writeNote("c-linked", { type: "check", applies_to: [], since: "3", kind: "test", tags: [], source: "manual" }, "# c-linked");

  const ids = (result: ReturnType<typeof stackContext>) => result.practices.map((note) => note.id).sort();
  assert.deepEqual(ids(stackContext(vault, ["fastapi", "legacy"], { versions: { fastapi: "2.5.0" } })), ["p-always", "p-legacy", "p-old"]);
  assert.deepEqual(ids(stackContext(vault, ["fastapi", "legacy"], { versions: { fastapi: "3.1.0" } })), [
    "p-always",
    "p-legacy",
    "p-linked",
    "p-new",
  ]);
  assert.deepEqual(ids(stackContext(vault, ["fastapi", "legacy"])), ["p-always", "p-legacy", "p-linked", "p-new", "p-old"]);

  const checks = stackContext(vault, ["fastapi"], { versions: { fastapi: "2.5.0" } }).checks;
  assert.deepEqual(
    checks.map((note) => note.id),
    [],
  );
  assert.deepEqual(
    stackContext(vault, ["fastapi"], { versions: { fastapi: "3.1.0" } }).checks.map((note) => note.id),
    ["c-linked"],
  );
});
