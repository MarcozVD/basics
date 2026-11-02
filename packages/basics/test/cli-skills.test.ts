import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

const CLI = path.join(path.resolve(import.meta.dirname, "../../.."), "packages/basics/src/cli.ts");

interface Sandbox {
  home: string;
  env: NodeJS.ProcessEnv;
}

function sandbox(): Sandbox {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-skills-cli-"));
  const home = path.join(dir, "home");
  fs.mkdirSync(home, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    BASICS_CONFIG: path.join(dir, "config.json"),
    BASICS_DIR: path.join(dir, "vault"),
  };
  return { home, env };
}

function seedSkill(home: string, dir: string, name: string, description: string): void {
  const full = path.join(home, dir);
  fs.mkdirSync(full, { recursive: true });
  fs.writeFileSync(path.join(full, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n`);
}

function runSkills(args: string[], env: NodeJS.ProcessEnv) {
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI, "skills", ...args], {
    cwd: path.resolve(import.meta.dirname, "../../.."),
    env,
    encoding: "utf8",
    timeout: 60000,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr || String(result.error ?? "") };
}

test("basics skills --json prints the scan", () => {
  const box = sandbox();
  seedSkill(box.home, ".claude/skills/impeccable", "impeccable", "Improve a frontend interface.");
  seedSkill(box.home, ".agents/skills/security-audit", "security-audit", "Security and vulnerability review.");

  const run = runSkills(["--json"], box.env);
  assert.equal(run.status, 0, run.stderr);
  const body = JSON.parse(run.stdout) as {
    agents: Array<{ id: string }>;
    skills: Array<{ name: string; area: string; agents: string[] }>;
  };
  assert.deepEqual(
    body.skills.map((skill) => [skill.name, skill.area, skill.agents]),
    [
      ["impeccable", "frontend", ["claude-code"]],
      ["security-audit", "security", ["shared"]],
    ],
  );
});

test("basics skills groups the table by area", () => {
  const box = sandbox();
  seedSkill(box.home, ".claude/skills/impeccable", "impeccable", "Improve a frontend interface.");
  seedSkill(box.home, ".agents/skills/security-audit", "security-audit", "Security and vulnerability review.");

  const run = runSkills([], box.env);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Frontend/);
  assert.match(run.stdout, /Security/);
  assert.match(run.stdout, /impeccable/);
  assert.ok(run.stdout.indexOf("Frontend") < run.stdout.indexOf("Security"), run.stdout);
});

test("basics skills explains an empty home", () => {
  const box = sandbox();
  const run = runSkills([], box.env);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /no skills found/);
});
