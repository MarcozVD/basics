import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { connect, connectStatus, disconnect } from "../src/connect.js";
import { createApp } from "../src/server/app.js";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const CLI = path.join(ROOT, "packages/basics/src/cli.ts");
const SKILL = path.join(ROOT, "skills", "basics", "SKILL.md");

interface Sandbox {
  home: string;
  vault: string;
  env: NodeJS.ProcessEnv;
}

/** A throwaway HOME: every path connect/disconnect touch lives under `home`. */
function sandbox(): Sandbox {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-disconnect-"));
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

/**
 * connect/claude-desktop read the process environment (homedir, APPDATA, PATH), so every test
 * points the process at the sandbox: an empty PATH also keeps the real `claude` CLI out of play.
 */
function useEnv(box: Sandbox, extra: NodeJS.ProcessEnv = {}): () => void {
  const keys = ["HOME", "USERPROFILE", "APPDATA", "PATH", "BASICS_CONNECT_NO_CLI"];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  const values: Record<string, string | undefined> = { ...box.env, ...extra };
  for (const key of keys) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const key of keys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

function runCli(args: string[], box: Sandbox) {
  const result = spawnSync(process.execPath, ["--import", "tsx", CLI, ...args], {
    cwd: ROOT,
    env: box.env,
    encoding: "utf8",
    timeout: 60000,
  });
  return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr || String(result.error ?? "") };
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

/** Claude Desktop's config directory for this platform, under the sandbox home. */
function desktopDir(box: Sandbox): string {
  if (process.platform === "win32") return path.join(box.env.APPDATA ?? "", "Claude");
  if (process.platform === "darwin") return path.join(box.home, "Library", "Application Support", "Claude");
  return path.join(box.home, ".config", "Claude");
}

/** Every client directory exists, so `connect` with no client list picks all five up. */
function installAllClients(box: Sandbox): void {
  fs.mkdirSync(path.join(box.home, ".claude"), { recursive: true });
  fs.mkdirSync(path.join(box.home, ".config", "opencode"), { recursive: true });
  fs.mkdirSync(path.join(box.home, ".codex"), { recursive: true });
  fs.mkdirSync(path.join(box.home, ".cursor"), { recursive: true });
  fs.mkdirSync(desktopDir(box), { recursive: true });
}

test("connectStatus reports a fresh machine as neither installed nor connected", () => {
  const box = sandbox();
  const restore = useEnv(box);
  try {
    const status = connectStatus({ vault: box.vault, home: box.home });

    assert.equal(status.vault, path.resolve(box.vault));
    assert.deepEqual(
      status.clients.map((client) => client.client),
      ["claude-code", "opencode", "codex", "cursor", "claude-desktop"],
    );
    for (const client of status.clients) {
      assert.equal(client.detected, false, client.client);
      assert.equal(client.connected, false, client.client);
      assert.equal(client.skill, client.client === "cursor" || client.client === "claude-desktop" ? null : false);
      assert.ok(client.configPath.startsWith("~/"), client.configPath);
    }
  } finally {
    restore();
  }
});

test("connectStatus follows connect(), then disconnect() clears it again", () => {
  const box = sandbox();
  installAllClients(box);
  const restore = useEnv(box, { BASICS_CONNECT_NO_CLI: "1" });
  try {
    const connected = connect({ vault: box.vault });
    assert.ok(connected.entries.some((entry) => entry.result === "registered"));

    const status = connectStatus({ vault: box.vault });
    for (const client of status.clients) {
      assert.equal(client.detected, true, client.client);
      assert.equal(client.connected, true, client.client);
      assert.equal(client.transport, "stdio", client.client);
    }
    assert.deepEqual(
      status.clients.map((client) => client.skill),
      [true, true, true, null, null],
    );
    assert.ok(status.clients.some((client) => client.configPath === "~/.claude.json"));
    assert.ok(status.clients.some((client) => client.configPath === "~/.codex/config.toml"));

    const removed = disconnect({ home: box.home });
    assert.equal(removed.entries.length, 5);
    for (const entry of removed.entries) {
      assert.equal(entry.result, "removed", `${entry.client}: ${entry.message ?? ""}`);
      if (entry.skill) assert.equal(entry.skill.result, "removed", entry.client);
    }

    const after = connectStatus({ vault: box.vault });
    for (const client of after.clients) {
      assert.equal(client.connected, false, client.client);
      if (client.skill !== null) assert.equal(client.skill, false, client.client);
    }
  } finally {
    restore();
  }
});

test("an http entry pointing at a local MCP URL counts as connected", () => {
  const box = sandbox();
  const restore = useEnv(box);
  try {
    writeJson(path.join(box.home, ".cursor", "mcp.json"), {
      mcpServers: { basics: { url: "http://127.0.0.1:4811/mcp" } },
    });

    const status = connectStatus({ vault: box.vault, home: box.home });
    const cursor = status.clients.find((client) => client.client === "cursor");
    assert.equal(cursor?.connected, true);
    assert.equal(cursor?.transport, "http");
    assert.equal(cursor?.detected, true);
    assert.equal(cursor?.skill, null);
  } finally {
    restore();
  }
});

test("an entry pointing at another vault, or a remote URL, is not connected", () => {
  const box = sandbox();
  const restore = useEnv(box);
  try {
    writeJson(path.join(box.home, ".claude.json"), {
      mcpServers: { basics: { command: process.execPath, args: ["/tmp/server.js", "/elsewhere/vault"] } },
    });
    writeJson(path.join(box.home, ".config", "opencode", "opencode.json"), {
      mcp: { basics: { type: "local", command: [process.execPath, "/tmp/server.js", path.resolve(box.vault)], enabled: true } },
    });
    writeJson(path.join(box.home, ".cursor", "mcp.json"), {
      mcpServers: { basics: { url: "https://example.com/mcp" } },
    });

    const status = connectStatus({ vault: box.vault, home: box.home });
    assert.equal(status.clients.find((client) => client.client === "claude-code")?.connected, false);
    assert.equal(status.clients.find((client) => client.client === "cursor")?.connected, false);
    const opencode = status.clients.find((client) => client.client === "opencode");
    assert.equal(opencode?.connected, true);
    assert.equal(opencode?.transport, "stdio");
  } finally {
    restore();
  }
});

test("disconnect removes only the Basics entry and the skill, keeping every other key", () => {
  const box = sandbox();
  const restore = useEnv(box);
  try {
    const home = box.home;
    const claudeJson = path.join(home, ".claude.json");
    writeJson(claudeJson, { numStartups: 7, mcpServers: { other: { command: "other-mcp" }, basics: { command: "x", args: [] } } });
    const opencode = path.join(home, ".config", "opencode", "opencode.json");
    writeJson(opencode, {
      $schema: "https://opencode.ai/config.json",
      theme: "dark",
      mcp: {
        other: { type: "local", command: ["other"], enabled: true },
        basics: { type: "local", command: ["x"], enabled: true },
      },
    });
    const codex = path.join(home, ".codex", "config.toml");
    fs.mkdirSync(path.dirname(codex), { recursive: true });
    fs.writeFileSync(
      codex,
      'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "other"\nargs = []\n\n[mcp_servers.basics]\ncommand = "x"\nargs = []\n',
    );
    const cursor = path.join(home, ".cursor", "mcp.json");
    writeJson(cursor, { mcpServers: { basics: { command: "x", args: [] } } });
    const desktop = path.join(desktopDir(box), "claude_desktop_config.json");
    writeJson(desktop, {
      globalShortcut: "ctrl+space",
      mcpServers: { other: { command: "z" }, basics: { command: "x", args: [] } },
    });
    for (const dir of [
      path.join(home, ".claude", "skills", "basics"),
      path.join(home, ".config", "opencode", "skills", "basics"),
      path.join(home, ".codex", "skills", "basics"),
    ]) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "SKILL.md"), fs.readFileSync(SKILL, "utf8"));
      fs.writeFileSync(path.join(dir, "keep.txt"), "keep");
    }

    const result = disconnect({ home });
    assert.equal(result.entries.length, 5);
    for (const entry of result.entries) assert.equal(entry.result, "removed", `${entry.client}: ${entry.message ?? ""}`);

    const claude = readJson(claudeJson);
    assert.equal(claude.numStartups, 7);
    assert.deepEqual(claude.mcpServers, { other: { command: "other-mcp" } });

    const opencodeJson = readJson(opencode);
    assert.equal(opencodeJson.$schema, "https://opencode.ai/config.json");
    assert.equal(opencodeJson.theme, "dark");
    assert.deepEqual(opencodeJson.mcp, { other: { type: "local", command: ["other"], enabled: true } });

    assert.equal(fs.readFileSync(codex, "utf8"), 'model = "gpt-5"\n\n[mcp_servers.other]\ncommand = "other"\nargs = []\n');
    // A config that only held the Basics entry is deleted instead of left behind as an empty stub.
    assert.equal(fs.existsSync(cursor), false);
    const desktopJson = readJson(desktop);
    assert.equal(desktopJson.globalShortcut, "ctrl+space");
    assert.deepEqual(desktopJson.mcpServers, { other: { command: "z" } });

    // The skill file goes, anything else the owner put in that folder stays.
    assert.equal(fs.existsSync(path.join(home, ".claude", "skills", "basics", "SKILL.md")), false);
    assert.equal(fs.readFileSync(path.join(home, ".claude", "skills", "basics", "keep.txt"), "utf8"), "keep");
    assert.equal(fs.existsSync(path.join(home, ".codex", "skills", "basics", "SKILL.md")), false);

    // Second run is a no-op that reports the entries as absent.
    const again = disconnect({ home });
    for (const entry of again.entries) assert.equal(entry.result, "absent", entry.client);
  } finally {
    restore();
  }
});

test("disconnect leaves untouched files byte-identical and reports absent", () => {
  const box = sandbox();
  const restore = useEnv(box);
  try {
    const file = path.join(box.home, ".cursor", "mcp.json");
    const before = '{\n  "mcpServers": {\n    "other": {\n      "command": "z"\n    }\n  }\n}\n';
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, before);

    const result = disconnect({ clients: ["cursor"], home: box.home });
    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].result, "absent");
    assert.equal(fs.readFileSync(file, "utf8"), before);

    const missing = disconnect({ clients: ["codex"], home: box.home });
    assert.equal(missing.entries[0].result, "absent");
    assert.equal(fs.existsSync(path.join(box.home, ".codex", "config.toml")), false);
  } finally {
    restore();
  }
});

test("--dry-run prints the diff and writes nothing", () => {
  const box = sandbox();
  const restore = useEnv(box);
  try {
    const file = path.join(box.home, ".cursor", "mcp.json");
    const before = { mcpServers: { basics: { command: "x", args: [] }, other: { command: "z" } } };
    writeJson(file, before);
    const skillDir = path.join(box.home, ".config", "opencode", "skills", "basics");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "old");

    const result = disconnect({ clients: ["cursor", "opencode"], home: box.home, dryRun: true });
    const cursorEntry = result.entries.find((entry) => entry.client === "cursor");
    const opencodeEntry = result.entries.find((entry) => entry.client === "opencode");
    assert.equal(cursorEntry?.result, "dry-run");
    assert.ok(cursorEntry?.diff?.includes('"basics"'), cursorEntry?.diff);
    assert.equal(opencodeEntry?.skill?.result, "dry-run");
    assert.deepEqual(readJson(file), before);
    assert.equal(fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8"), "old");
  } finally {
    restore();
  }
});

test("an unparseable config is reported as manual and left alone", () => {
  const box = sandbox();
  const restore = useEnv(box);
  try {
    const file = path.join(box.home, ".cursor", "mcp.json");
    const broken = '{\n  // a comment\n  "mcpServers": {}\n}\n';
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, broken);

    const result = disconnect({ clients: ["cursor"], home: box.home });
    assert.equal(result.entries[0].result, "manual");
    assert.ok(result.entries[0].message?.includes("by hand"), result.entries[0].message);
    assert.equal(fs.readFileSync(file, "utf8"), broken);
  } finally {
    restore();
  }
});

test("GET /api/connect/status and POST /api/disconnect work against a temp HOME", async () => {
  const box = sandbox();
  fs.mkdirSync(path.join(box.home, ".cursor"), { recursive: true });
  const restore = useEnv(box, { BASICS_CONNECT_NO_CLI: "1" });
  try {
    const app = createApp({ root: box.vault });
    const register = await app.request("/api/connect", {
      method: "POST",
      headers: { host: "localhost:4811", "content-type": "application/json" },
      body: JSON.stringify({ clients: ["cursor"] }),
    });
    assert.equal(register.status, 200);

    const statusRes = await app.request("/api/connect/status", { headers: { host: "localhost:4811" } });
    assert.equal(statusRes.status, 200);
    const status = (await statusRes.json()) as {
      vault: string;
      clients: { client: string; detected: boolean; connected: boolean; skill: boolean | null; configPath: string }[];
    };
    assert.equal(status.vault, path.resolve(box.vault));
    const cursor = status.clients.find((client) => client.client === "cursor");
    assert.deepEqual(cursor, {
      client: "cursor",
      detected: true,
      connected: true,
      transport: "stdio",
      skill: null,
      configPath: "~/.cursor/mcp.json",
    });

    const removed = await app.request("/api/disconnect", {
      method: "POST",
      headers: { host: "localhost:4811", "content-type": "application/json" },
      body: JSON.stringify({ clients: ["cursor"] }),
    });
    assert.equal(removed.status, 200);
    const removedBody = (await removed.json()) as { entries: { client: string; result: string }[] };
    assert.equal(removedBody.entries[0].result, "removed");
    assert.equal(fs.existsSync(path.join(box.home, ".cursor", "mcp.json")), false);

    const blocked = await app.request("/api/disconnect", {
      method: "POST",
      headers: { host: "localhost:4811", origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ clients: ["cursor"] }),
    });
    assert.equal(blocked.status, 403);

    const invalid = await app.request("/api/disconnect", {
      method: "POST",
      headers: { host: "localhost:4811", "content-type": "application/json" },
      body: JSON.stringify({ clients: ["nope"] }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    restore();
  }
}, 60000);

test("POST /api/disconnect requires an explicit client list and only touches the named client", async () => {
  const box = sandbox();
  fs.mkdirSync(path.join(box.home, ".cursor"), { recursive: true });
  fs.mkdirSync(path.join(box.home, ".codex"), { recursive: true });
  const restore = useEnv(box, { BASICS_CONNECT_NO_CLI: "1" });
  try {
    const app = createApp({ root: box.vault });
    const headers = { host: "localhost:4811", "content-type": "application/json" };
    const seeded = await app.request("/api/connect", {
      method: "POST",
      headers,
      body: JSON.stringify({ clients: ["cursor", "codex"], skill: false }),
    });
    assert.equal(seeded.status, 200);

    const cursorFile = path.join(box.home, ".cursor", "mcp.json");
    const codexFile = path.join(box.home, ".codex", "config.toml");
    const cursorBefore = fs.readFileSync(cursorFile, "utf8");
    const codexBefore = fs.readFileSync(codexFile, "utf8");
    assert.match(codexBefore, /\[mcp_servers\.basics\]/);

    // No body, an empty object, an empty list and a malformed body: all rejected before anything is written.
    for (const body of [undefined, "{}", JSON.stringify({ clients: [] }), "not json"]) {
      const res = await app.request("/api/disconnect", { method: "POST", headers, body });
      assert.equal(res.status, 400, String(body));
      const error = (await res.json()) as { error: string; message: string };
      assert.equal(error.error, "invalid", String(body));
      assert.ok(error.message.length > 0, String(body));
      assert.equal(fs.readFileSync(cursorFile, "utf8"), cursorBefore, String(body));
      assert.equal(fs.readFileSync(codexFile, "utf8"), codexBefore, String(body));
    }

    const one = await app.request("/api/disconnect", {
      method: "POST",
      headers,
      body: JSON.stringify({ clients: ["cursor"] }),
    });
    assert.equal(one.status, 200);
    const oneBody = (await one.json()) as { entries: { client: string; result: string }[] };
    assert.deepEqual(
      oneBody.entries.map((entry) => [entry.client, entry.result]),
      [["cursor", "removed"]],
    );
    assert.equal(fs.existsSync(cursorFile), false);
    // The client that was not named keeps its entry, byte for byte.
    assert.equal(fs.readFileSync(codexFile, "utf8"), codexBefore);
  } finally {
    restore();
  }
}, 60000);

test("basics disconnect removes the entry and the skill, mirroring connect", () => {
  const box = sandbox();
  const register = runCli(["connect", "--client", "claude-code", "codex"], box);
  assert.equal(register.status, 0, register.stderr);
  const codex = path.join(box.home, ".codex", "config.toml");
  assert.match(fs.readFileSync(codex, "utf8"), /\[mcp_servers\.basics\]/);
  assert.ok(fs.existsSync(path.join(box.home, ".claude", "skills", "basics", "SKILL.md")));

  const dry = runCli(["disconnect", "claude-code", "--dry-run"], box);
  assert.equal(dry.status, 0, dry.stderr);
  assert.ok(dry.stdout.includes("dry-run"), dry.stdout);
  assert.match(fs.readFileSync(codex, "utf8"), /\[mcp_servers\.basics\]/);

  const run = runCli(["disconnect", "claude-code", "codex", "--no-skill"], box);
  assert.equal(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes("removed"), run.stdout);
  // The `.claude.json` only held the Basics entry, so it is deleted rather than left as an empty stub.
  assert.equal(fs.existsSync(path.join(box.home, ".claude.json")), false);
  assert.equal(fs.existsSync(codex), false);
  // `--no-skill` keeps the skill in place.
  assert.ok(fs.existsSync(path.join(box.home, ".claude", "skills", "basics", "SKILL.md")));
}, 120000);
