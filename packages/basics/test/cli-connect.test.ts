import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { createApp } from "../src/server/app.js";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const CLI = path.join(ROOT, "packages/basics/src/cli.ts");
const SERVER = path.join(ROOT, "packages/basics", "dist", "mcp", "server.js");
const SKILL = path.join(ROOT, "skills", "basics", "SKILL.md");

interface Sandbox {
  home: string;
  vault: string;
  env: NodeJS.ProcessEnv;
}

/** A throwaway HOME: every path connect touches lives under `home`. */
function sandbox(): Sandbox {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-connect-"));
  const home = path.join(dir, "home");
  const emptyPath = path.join(dir, "empty-path");
  const vault = path.join(dir, "vault");
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(emptyPath);
  fs.mkdirSync(vault);
  const configFile = path.join(dir, "config.json");
  fs.writeFileSync(configFile, JSON.stringify({ vault, language: "en" }));

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    BASICS_CONFIG: configFile,
    PATH: emptyPath,
  };
  delete env.BASICS_DIR;
  delete env.BASICS_CONNECT_NODE;
  delete env.BASICS_CONNECT_SERVER;
  delete env.BASICS_CONNECT_SKILL;
  delete env.BASICS_CONNECT_NO_CLI;
  return { home, vault, env };
}

function runConnect(args: string[], box: Sandbox, extraEnv: NodeJS.ProcessEnv = {}) {
  const env = { ...box.env, ...extraEnv };
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI, "connect", ...args], {
    cwd: ROOT,
    env,
    encoding: "utf8",
    timeout: 60000,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr || String(result.error ?? "") };
}

function writeJson(file: string, value: unknown): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const text = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(file, text);
  return text;
}

interface JsonFile {
  [key: string]: unknown;
  mcpServers?: Record<string, unknown>;
  mcp?: Record<string, unknown>;
}

function readJson(file: string): JsonFile {
  return JSON.parse(fs.readFileSync(file, "utf8")) as JsonFile;
}

/** Desktop app config directory for the current platform, under the sandbox HOME. */
function desktopDir(box: Sandbox): string {
  if (process.platform === "win32") return path.join(box.env.APPDATA ?? "", "Claude");
  if (process.platform === "darwin") return path.join(box.home, "Library", "Application Support", "Claude");
  return path.join(box.home, ".config", "Claude");
}

const expectedCommand = (box: Sandbox): string[] => [process.execPath, path.resolve(SERVER), path.resolve(box.vault)];

test("connect registers every detected client, merges configs and installs the skill", () => {
  const box = sandbox();
  const home = box.home;
  const command = expectedCommand(box);

  const claudeJson = path.join(home, ".claude.json");
  const claudeBefore = writeJson(claudeJson, {
    numStartups: 7,
    mcpServers: { other: { command: "other-mcp" } },
  });
  writeJson(path.join(home, ".config", "opencode", "opencode.json"), {
    $schema: "https://opencode.ai/config.json",
    theme: "dark",
    mcp: { other: { type: "local", command: ["other"], enabled: true } },
  });
  const codex = path.join(home, ".codex", "config.toml");
  fs.mkdirSync(path.dirname(codex), { recursive: true });
  fs.writeFileSync(codex, 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "other"\nargs = []\n');
  const cursor = path.join(home, ".cursor", "mcp.json");
  writeJson(cursor, { mcpServers: {} });
  fs.writeFileSync(`${cursor}.basics-backup`, "SENTINEL");
  const desktop = path.join(desktopDir(box), "claude_desktop_config.json");
  writeJson(desktop, { globalShortcut: "ctrl+space", mcpServers: { other: { command: "z" } } });

  const result = runConnect([], box);
  assert.equal(result.status, 0, result.stderr);
  for (const client of ["claude-code", "opencode", "codex", "cursor", "claude-desktop"]) {
    assert.ok(result.stdout.includes(client), `missing ${client} in the table`);
  }
  assert.ok(result.stdout.includes("registered"), result.stdout);

  const claude = readJson(claudeJson);
  assert.equal(claude.numStartups, 7);
  assert.deepEqual(claude.mcpServers?.other, { command: "other-mcp" });
  assert.deepEqual(claude.mcpServers?.basics, { command: command[0], args: command.slice(1) });
  assert.equal(fs.readFileSync(`${claudeJson}.basics-backup`, "utf8"), claudeBefore);

  const opencode = readJson(path.join(home, ".config", "opencode", "opencode.json"));
  assert.equal(opencode.$schema, "https://opencode.ai/config.json");
  assert.equal(opencode.theme, "dark");
  assert.deepEqual(opencode.mcp?.other, { type: "local", command: ["other"], enabled: true });
  assert.deepEqual(opencode.mcp?.basics, { type: "local", command, enabled: true });

  const codexText = fs.readFileSync(codex, "utf8");
  assert.match(codexText, /model = "gpt-5"/);
  assert.match(codexText, /\[mcp_servers\.other\]\ncommand = "other"\nargs = \[\]/);
  assert.match(codexText, /\[mcp_servers\.basics\]/);
  const toml = (value: string) => `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  assert.ok(codexText.includes(`command = ${toml(command[0])}`), codexText);
  assert.ok(codexText.includes(`args = [${command.slice(1).map(toml).join(", ")}]`), codexText);

  const cursorJson = readJson(cursor);
  assert.deepEqual(cursorJson.mcpServers?.basics, { command: command[0], args: command.slice(1) });
  assert.equal(fs.readFileSync(`${cursor}.basics-backup`, "utf8"), "SENTINEL");

  const desktopJson = readJson(desktop);
  assert.equal(desktopJson.globalShortcut, "ctrl+space");
  assert.deepEqual(desktopJson.mcpServers?.other, { command: "z" });
  assert.deepEqual(desktopJson.mcpServers?.basics, { command: command[0], args: command.slice(1) });

  const skill = fs.readFileSync(SKILL, "utf8");
  for (const dir of [
    path.join(home, ".claude", "skills", "basics"),
    path.join(home, ".config", "opencode", "skills", "basics"),
    path.join(home, ".codex", "skills", "basics"),
  ]) {
    assert.equal(fs.readFileSync(path.join(dir, "SKILL.md"), "utf8"), skill);
  }
  assert.equal(fs.existsSync(path.join(home, ".cursor", "skills")), false);

  const again = runConnect([], box);
  assert.equal(again.status, 0, again.stderr);
  assert.ok(again.stdout.includes("unchanged"), again.stdout);
  assert.equal(fs.readFileSync(`${cursor}.basics-backup`, "utf8"), "SENTINEL");
}, 120000);

test("--dry-run prints the diff and writes nothing", () => {
  const box = sandbox();
  fs.mkdirSync(path.join(box.home, ".cursor"));

  const dry = runConnect(["--client", "cursor", "--dry-run"], box);
  assert.equal(dry.status, 0, dry.stderr);
  assert.ok(dry.stdout.includes("+ "), dry.stdout);
  assert.ok(dry.stdout.includes("dry-run"), dry.stdout);
  assert.equal(fs.existsSync(path.join(box.home, ".cursor", "mcp.json")), false);
  assert.equal(fs.existsSync(path.join(box.home, ".cursor", "mcp.json.basics-backup")), false);

  const skillDry = runConnect(["--client", "claude-code", "--dry-run"], box);
  assert.equal(skillDry.status, 0, skillDry.stderr);
  assert.equal(fs.existsSync(path.join(box.home, ".claude", "skills", "basics", "SKILL.md")), false);

  const run = runConnect(["--client", "cursor"], box);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(fs.existsSync(path.join(box.home, ".cursor", "mcp.json")));
}, 120000);

test("invalid JSONC is left untouched and the snippet is printed", () => {
  const box = sandbox();
  const file = path.join(box.home, ".config", "opencode", "opencode.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const broken = '{\n  // keep this comment\n  "mcp": {}\n}\n';
  fs.writeFileSync(file, broken);

  const result = runConnect(["--client", "opencode", "--no-skill"], box);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(file, "utf8"), broken);
  assert.equal(fs.existsSync(`${file}.basics-backup`), false);
  assert.ok(result.stdout.includes("Paste this"), result.stdout);
  assert.ok(result.stdout.includes('"basics"'), result.stdout);
  assert.ok(result.stdout.includes("manual"), result.stdout);
}, 120000);

test("http transport writes the URL and skips codex", () => {
  const box = sandbox();
  const opencode = path.join(box.home, ".config", "opencode", "opencode.json");
  writeJson(opencode, {});
  const codex = path.join(box.home, ".codex", "config.toml");
  fs.mkdirSync(path.dirname(codex), { recursive: true });
  fs.writeFileSync(codex, 'model = "gpt-5"\n');

  const result = runConnect(["--client", "opencode", "codex", "--transport", "http", "--port", "5055"], box);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readJson(opencode).mcp?.basics, {
    type: "remote",
    url: "http://127.0.0.1:5055/mcp",
    enabled: true,
  });
  assert.equal(fs.readFileSync(codex, "utf8"), 'model = "gpt-5"\n');
  assert.ok(result.stdout.includes("only supports stdio"), result.stdout);
}, 120000);

test("BASICS_CONNECT_NODE and BASICS_CONNECT_SERVER override the stdio command", () => {
  const box = sandbox();
  const result = runConnect(["--client", "cursor", "--no-skill"], box, {
    BASICS_CONNECT_NODE: "/custom/node",
    BASICS_CONNECT_SERVER: "/custom/server.js",
  });
  assert.equal(result.status, 0, result.stderr);
  const cursor = readJson(path.join(box.home, ".cursor", "mcp.json"));
  assert.deepEqual(cursor.mcpServers?.basics, {
    command: "/custom/node",
    args: ["/custom/server.js", path.resolve(box.vault)],
  });
}, 120000);

test("POST /api/connect returns the result and keeps the host/origin guard", async () => {
  const box = sandbox();
  const saved = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    APPDATA: process.env.APPDATA,
    PATH: process.env.PATH,
    BASICS_CONNECT_NO_CLI: process.env.BASICS_CONNECT_NO_CLI,
  };
  process.env.HOME = box.home;
  process.env.USERPROFILE = box.home;
  process.env.APPDATA = box.env.APPDATA;
  process.env.PATH = box.env.PATH;
  process.env.BASICS_CONNECT_NO_CLI = "1";
  try {
    const app = createApp({ root: box.vault });
    const res = await app.request("/api/connect", {
      method: "POST",
      headers: { host: "localhost:4747", "content-type": "application/json" },
      body: JSON.stringify({ clients: ["cursor"], skill: false }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      entries: { client: string; detected: boolean; result: string }[];
      command: string[];
      vault: string;
    };
    assert.equal(body.vault, path.resolve(box.vault));
    assert.equal(body.entries.length, 1);
    assert.equal(body.entries[0].client, "cursor");
    assert.equal(body.entries[0].result, "registered");
    assert.ok(fs.existsSync(path.join(box.home, ".cursor", "mcp.json")));

    const blocked = await app.request("/api/connect", {
      method: "POST",
      headers: { host: "localhost:4747", origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(blocked.status, 403);
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}, 60000);
