import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { createApp } from "../src/server/app.js";

const HOST = { host: "localhost:4747" };

interface Sandbox {
  home: string;
  configFile: string;
  root: string;
  restore: () => void;
}

/** Point `os.homedir()` and the Basics config at a temp dir for the duration of one test. */
function sandbox(): Sandbox {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-skills-api-"));
  const home = path.join(dir, "home");
  const root = path.join(dir, "vault");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(root, { recursive: true });
  const configFile = path.join(dir, "config.json");

  const previous = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    BASICS_CONFIG: process.env.BASICS_CONFIG,
  };
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.BASICS_CONFIG = configFile;

  const restore = () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  return { home, configFile, root, restore };
}

function seedSkill(home: string, dir: string, name: string, description: string): void {
  const full = path.join(home, dir);
  fs.mkdirSync(full, { recursive: true });
  fs.writeFileSync(path.join(full, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\n`);
}

function app(root: string) {
  return createApp({ root });
}

function json(body: unknown, method: string): RequestInit {
  return { method, headers: { ...HOST, "content-type": "application/json" }, body: JSON.stringify(body) };
}

test("GET /api/skills lists agents and their skills", async () => {
  const box = sandbox();
  try {
    seedSkill(box.home, ".claude/skills/impeccable", "impeccable", "Improve a frontend interface.");
    seedSkill(box.home, ".agents/skills/graphify", "graphify", "Persistent knowledge graph of a codebase.");

    const res = await app(box.root).request("/api/skills", { headers: HOST });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      agents: Array<{ id: string; detected: boolean; dirs: string[] }>;
      skills: Array<{ key: string; name: string; area: string; areaSource: string; agents: string[]; path: string }>;
    };

    assert.deepEqual(
      body.agents.map((agent) => agent.id),
      ["claude-code", "opencode", "codex", "shared"],
    );
    assert.deepEqual(body.agents[0].dirs, ["~/.claude/skills"]);
    assert.deepEqual(
      body.skills.map((skill) => [skill.name, skill.area, skill.areaSource, skill.agents]),
      [
        ["impeccable", "frontend", "keywords", ["claude-code"]],
        ["graphify", "data", "keywords", ["shared"]],
      ],
    );
    assert.equal(body.skills[0].key, "impeccable");
    assert.equal(body.skills[0].path, "~/.claude/skills/impeccable/SKILL.md");
  } finally {
    box.restore();
  }
});

test("PUT and DELETE /api/skills/:key/area persist an override in the config", async () => {
  const box = sandbox();
  try {
    seedSkill(box.home, ".claude/skills/impeccable", "impeccable", "Improve a frontend interface.");
    fs.writeFileSync(box.configFile, JSON.stringify({ vault: box.root, language: "es" }));
    const server = app(box.root);

    const put = await server.request("/api/skills/impeccable/area", json({ area: "testing" }, "PUT"));
    assert.equal(put.status, 200);
    assert.deepEqual(await put.json(), { key: "impeccable", area: "testing" });

    const saved = JSON.parse(fs.readFileSync(box.configFile, "utf8")) as {
      language: string;
      skills: { areas: Record<string, string> };
    };
    assert.equal(saved.language, "es");
    assert.deepEqual(saved.skills.areas, { impeccable: "testing" });

    const listed = (await (await server.request("/api/skills", { headers: HOST })).json()) as {
      skills: Array<{ area: string; areaSource: string }>;
    };
    assert.deepEqual(
      listed.skills.map((skill) => [skill.area, skill.areaSource]),
      [["testing", "override"]],
    );

    const reset = await server.request("/api/skills/impeccable/area", { method: "DELETE", headers: HOST });
    assert.equal(reset.status, 200);
    assert.deepEqual(await reset.json(), { key: "impeccable", area: null });

    const after = (await (await server.request("/api/skills", { headers: HOST })).json()) as {
      skills: Array<{ area: string; areaSource: string }>;
    };
    assert.deepEqual(
      after.skills.map((skill) => [skill.area, skill.areaSource]),
      [["frontend", "keywords"]],
    );
    const cleared = JSON.parse(fs.readFileSync(box.configFile, "utf8")) as { skills: { areas: Record<string, string> } };
    assert.deepEqual(cleared.skills.areas, {});
  } finally {
    box.restore();
  }
});

test("area overrides validate the area and the key", async () => {
  const box = sandbox();
  try {
    seedSkill(box.home, ".claude/skills/impeccable", "impeccable", "Improve a frontend interface.");
    const server = app(box.root);

    const badArea = await server.request("/api/skills/impeccable/area", json({ area: "graphics" }, "PUT"));
    assert.equal(badArea.status, 400);

    const badKey = await server.request("/api/skills/Bad_Key/area", json({ area: "testing" }, "PUT"));
    assert.equal(badKey.status, 400);

    const unknown = await server.request("/api/skills/not-installed/area", json({ area: "testing" }, "PUT"));
    assert.equal(unknown.status, 404);

    assert.equal(fs.existsSync(box.configFile), false, "a rejected request must not write the config");
  } finally {
    box.restore();
  }
});

test("DELETE clears an override without needing the skill to be installed", async () => {
  const box = sandbox();
  try {
    fs.writeFileSync(box.configFile, JSON.stringify({ language: "en", skills: { areas: { ghost: "testing" } } }));
    const res = await app(box.root).request("/api/skills/ghost/area", { method: "DELETE", headers: HOST });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { key: "ghost", area: null });
    const saved = JSON.parse(fs.readFileSync(box.configFile, "utf8")) as { language: string; skills: { areas: unknown } };
    assert.equal(saved.language, "en");
    assert.deepEqual(saved.skills.areas, {});
  } finally {
    box.restore();
  }
});

test("an empty home has no skills and no detected agents", async () => {
  const box = sandbox();
  try {
    const res = await app(box.root).request("/api/skills", { headers: HOST });
    const body = (await res.json()) as { agents: Array<{ detected: boolean }>; skills: unknown[] };
    assert.deepEqual(body.skills, []);
    assert.deepEqual(
      body.agents.map((agent) => agent.detected),
      [false, false, false, false],
    );
  } finally {
    box.restore();
  }
});
