import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { connect, connectCommand, connectSnippets, connectStatus, disconnect } from "../src/connect.js";
import { gooseConfig } from "../src/connect-goose.js";
import { patchPresetJson, readPresetJson } from "../src/connect-json.js";

const PRESETS = ["oh-my-pi", "gemini-cli", "qwen-code", "kimi-cli", "goose", "amp"] as const;

/** No lookup or write can escape this HOME, including Windows APPDATA. */
function sandbox(run: (home: string, vault: string) => void) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "basics-presets-"));
  const values = { HOME: home, USERPROFILE: home, APPDATA: path.join(home, "AppData", "Roaming"), PATH: home, BASICS_CONNECT_NO_CLI: "1" };
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    run(home, path.join(home, "vault with spaces"));
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(home, { recursive: true, force: true });
  }
}

for (const client of PRESETS) {
  for (const nl of ["\n", "\r\n"]) {
    for (const finalNewline of [false, true]) {
      test(`${client}: byte-identical round trip, ${nl === "\n" ? "LF" : "CRLF"}, final newline ${finalNewline}`, () =>
        sandbox((home, vault) => {
          const opts = { vault, clients: [client], skill: false };
          const target = connect({ ...opts, dryRun: true }).entries[0].target;
          const file = path.join(home, target.slice(2));
          const key = client === "amp" ? "amp.mcpServers" : "mcpServers";
          const fixture =
            client === "goose"
              ? "# keep comment\nextensions:\n  other:\n    type: stdio\n    cmd: other\n    enabled: true"
              : `{\n  // keep comment\n  "${key}": {\n    "other": { "command": "other" }\n  }\n}`;
          const before = Buffer.from(fixture.replace(/\n/g, nl) + (finalNewline ? nl : ""));
          fs.mkdirSync(path.dirname(file), { recursive: true });
          for (const transport of ["stdio", "http"] as const) {
            fs.writeFileSync(file, before);
            assert.equal(connect({ ...opts, transport, port: 4825 }).entries[0].result, "registered");
            assert.equal(fs.readFileSync(file, "utf8").endsWith("\n"), finalNewline, `${transport} connected final newline`);
            assert.equal(disconnect({ clients: [client], skill: false }).entries[0].result, "removed");
            assert.deepEqual(fs.readFileSync(file), before, transport);
          }
        }));
    }
  }

  for (const transport of ["stdio", "http"] as const) {
    test(`${client} ${transport}: empty, merge, dry-run, idempotence, status and disconnect`, () =>
      sandbox((home, vault) => {
        const opts = { vault, clients: [client], transport, port: 4825 };
        let status = connectStatus({ vault }).clients.find((entry) => entry.client === client);
        assert.equal(status?.detected, false);
        const dry = connect({ ...opts, dryRun: true }).entries[0];
        assert.equal(dry.result, "dry-run", dry.message);
        assert.ok(dry.diff?.includes("basics"));
        const file = path.join(home, dry.target.slice(2));
        assert.equal(fs.existsSync(file), false);
        assert.equal(connect(opts).entries[0].result, "registered");
        assert.equal(connect(opts).entries[0].result, "unchanged");
        status = connectStatus({ vault }).clients.find((entry) => entry.client === client);
        assert.equal(status?.connected, true);
        assert.equal(status?.transport, transport);
        assert.equal(status?.skill, true);
        assert.equal(disconnect({ clients: [client], dryRun: true }).entries[0].result, "dry-run");
        assert.equal(connectStatus({ vault }).clients.find((entry) => entry.client === client)?.connected, true);
        assert.equal(disconnect({ clients: [client] }).entries[0].result, "removed");
        assert.equal(connectStatus({ vault }).clients.find((entry) => entry.client === client)?.connected, false);
        assert.equal(disconnect({ clients: [client] }).entries[0].result, "absent");

        const key = client === "amp" ? "amp.mcpServers" : "mcpServers";
        const before =
          client === "goose"
            ? "# user comment\nGOOSE_MODEL: test\nextensions:\n  other:\n    type: stdio\n    cmd: other\n    enabled: true\n# keep this comment\n"
            : `${JSON.stringify({ theme: "dark", [key]: { first: { command: "first" }, last: { command: "last" } } }, null, 4)}\n`;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, before);
        assert.equal(connect({ ...opts, dryRun: true }).entries[0].result, "dry-run");
        assert.equal(fs.readFileSync(file, "utf8"), before);
        assert.equal(connect(opts).entries[0].result, "registered");
        if (client === "goose") {
          const text = fs.readFileSync(file, "utf8");
          assert.ok(text.startsWith(before));
          assert.equal(gooseConfig(text).GOOSE_MODEL, "test");
        } else {
          const servers = JSON.parse(fs.readFileSync(file, "utf8"))[key];
          assert.deepEqual(Object.keys(servers), ["first", "last", "basics"]);
          assert.deepEqual(servers.first, { command: "first" });
          assert.deepEqual(servers.last, { command: "last" });
          if (transport === "http") {
            assert.deepEqual(
              servers.basics,
              client === "gemini-cli" || client === "qwen-code"
                ? { httpUrl: "http://127.0.0.1:4825/mcp" }
                : client === "oh-my-pi"
                  ? { type: "http", url: "http://127.0.0.1:4825/mcp" }
                  : { url: "http://127.0.0.1:4825/mcp" },
            );
          } else assert.deepEqual(servers.basics, { command: connectCommand(vault)[0], args: connectCommand(vault).slice(1) });
        }
        assert.equal(connect(opts).entries[0].result, "unchanged");
        assert.equal(disconnect({ clients: [client] }).entries[0].result, "removed");
        if (client === "goose") assert.equal(fs.readFileSync(file, "utf8"), before);
        else assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), JSON.parse(before));
      }));
  }

  test(`${client}: malformed config is manual and never overwritten`, () =>
    sandbox((home, vault) => {
      const target = connect({ vault, clients: [client], dryRun: true, skill: false }).entries[0].target;
      const file = path.join(home, target.slice(2));
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "{broken: [");
      const entry = connect({ vault, clients: [client], skill: false }).entries[0];
      assert.equal(entry.result, "manual");
      assert.ok((entry.diff ?? entry.message)?.includes("basics"));
      assert.equal(fs.readFileSync(file, "utf8"), "{broken: [");
      assert.equal(connectStatus({ vault }).clients.find((entry) => entry.client === client)?.connected, false);
      assert.equal(disconnect({ clients: [client] }).entries[0].result, "manual");
      assert.equal(fs.readFileSync(file, "utf8"), "{broken: [");
    }));
}

test("JSON preset edits preserve comments, CRLF, formatting and sibling order", () => {
  const before =
    '{\r\n\t// preferences\r\n\t"theme": "dark",\r\n\t"amp.mcpServers": {\r\n\t\t"other": { "command": "keep", "args": ["x,}", "// literal"] } // keep\r\n\t}\r\n}\r\n';
  const added = patchPresetJson(before, ["amp.mcpServers", "basics"], { command: "node", args: ["vault with spaces"] });
  assert.ok(added.includes('\t// preferences\r\n\t"theme": "dark",'));
  assert.ok(added.includes('"other": { "command": "keep", "args": ["x,}", "// literal"] }'));
  assert.ok(added.includes("// keep"));
  const removed = patchPresetJson(added, ["amp.mcpServers", "basics"]);
  assert.equal(removed, before);
  assert.deepEqual(readPresetJson(removed), readPresetJson(before));
  assert.ok(removed.includes("// keep"));
  for (const text of ['{"mcpServers": {"basics": {}, "other": {}}}', '{"mcpServers": {"other": {}, "basics": {},}}']) {
    assert.deepEqual(readPresetJson(patchPresetJson(text, ["mcpServers", "basics"])), { mcpServers: { other: {} } });
  }
  assert.throws(() => patchPresetJson('{"mcpServers": {}, "mcpServers": {}}', ["mcpServers", "basics"], {}));
});

test("oh-my-pi registration re-enables only Basics in disabledServers", () =>
  sandbox((home, vault) => {
    const file = path.join(home, ".omp/agent/mcp.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{"disabledServers": ["other", "basics"], "mcpServers": {}}');
    assert.equal(connect({ vault, clients: ["oh-my-pi"], skill: false }).entries[0].result, "registered");
    assert.deepEqual(readPresetJson(fs.readFileSync(file, "utf8")).disabledServers, ["other"]);
    assert.equal(connectStatus({ vault }).clients.find((entry) => entry.client === "oh-my-pi")?.connected, true);
  }));

test("generic snippets use the actual desktop Node override, server and vault", () =>
  sandbox((_home, vault) => {
    const saved = [process.env.BASICS_CONNECT_NODE, process.env.BASICS_CONNECT_SERVER];
    try {
      process.env.BASICS_CONNECT_NODE = path.resolve("bundled node", "node.exe");
      process.env.BASICS_CONNECT_SERVER = path.resolve("desktop resources", "dist/mcp/server.js");
      const snippets = connectSnippets(vault, "http://127.0.0.1:4829/mcp");
      const entry = JSON.parse(snippets.json).mcpServers.basics;
      assert.equal(entry.command, process.env.BASICS_CONNECT_NODE);
      assert.deepEqual(entry.args, [process.env.BASICS_CONNECT_SERVER, vault]);
      assert.ok(snippets.toml.includes(JSON.stringify(vault)));
      assert.ok(snippets.command.includes(vault));
      assert.equal(snippets.http, "http://127.0.0.1:4829/mcp");
    } finally {
      for (const [i, key] of ["BASICS_CONNECT_NODE", "BASICS_CONNECT_SERVER"].entries()) {
        if (saved[i] === undefined) delete process.env[key];
        else process.env[key] = saved[i];
      }
    }
  }));
