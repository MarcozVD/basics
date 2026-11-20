import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Vault } from "@marcozvd/basics-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { test } from "vitest";
import { prepareCompareEnvironment } from "../src/compare-environment.js";
import { CompareDirectories, snapshotFiles } from "../src/compare-files.js";
import { createMcpServer } from "../src/mcp/tools.js";

test("generated connect configuration starts the built read-only stdio server", async () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "basics-compare-stdio-")),
    vaultRoot = path.join(base, "vault"),
    run = path.join(base, "run");
  fs.cpSync(path.resolve(import.meta.dirname, "../../../examples/vault"), vaultRoot, { recursive: true });
  fs.mkdirSync(run);
  const prepared = prepareCompareEnvironment(
    run,
    "claude",
    Vault.load(vaultRoot),
    ["fastapi"],
    "basics",
    process.env,
    path.join(base, "unused-auth"),
  );
  const config = JSON.parse(fs.readFileSync(path.join(prepared.control, "mcp.json"), "utf8")).mcpServers.basics;
  assert.equal(config.args.at(-1), "--read-only");
  const transport = new StdioClientTransport({
    ...config,
    env: Object.fromEntries(Object.entries(prepared.env).filter((entry): entry is [string, string] => typeof entry[1] === "string")),
    stderr: "pipe",
  });
  const client = new Client({ name: "compare-stdio-test", version: "1" });
  try {
    await client.connect(transport);
    assert.ok(!(await client.listTools()).tools.some((tool) => tool.name === "propose_note" || tool.name === "record_project_outcome"));
    assert.ok(!(await client.callTool({ name: "recommend_stack", arguments: { description: "REST API" } })).isError);
    assert.equal(fs.existsSync(path.join(vaultRoot, ".basics/activity.jsonl")), false);
  } finally {
    await client.close();
    const owner = new CompareDirectories();
    owner.own(base);
    owner.remove(base);
  }
});

test("compare read-only MCP excludes writes and reads the user's vault without activity or index changes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-compare-readonly-"));
  fs.cpSync(path.resolve(import.meta.dirname, "../../../examples/vault"), root, { recursive: true });
  const before = snapshotFiles(root);
  const server = createMcpServer(() => root, { readOnly: true }),
    client = new Client({ name: "compare-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  try {
    const tools = await client.listTools();
    assert.ok(!tools.tools.some((t) => ["propose_note", "record_project_outcome"].includes(t.name)));
    for (const [name, args] of [
      ["recommend_stack", { description: "REST API" }],
      ["get_note", { id: "fastapi" }],
      ["get_vault_overview", {}],
    ] as const) {
      const result = await client.callTool({ name, arguments: args });
      assert.ok(!result.isError);
    }
    const denied = await client.callTool({ name: "record_project_outcome", arguments: { project: "missing", summary: "must not write" } });
    assert.equal(denied.isError, true);
    assert.deepEqual(snapshotFiles(root), before);
    assert.equal(fs.existsSync(path.join(root, ".basics/activity.jsonl")), false);
  } finally {
    await client.close();
    await server.close();
    const owner = new CompareDirectories();
    owner.own(root);
    owner.remove(root);
  }
});

test("cleanup refuses nested deletion through a replaced owned root and unlinks the root junction safely", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "basics-compare-links-"));
  const owned = path.join(base, "run"),
    outside = path.join(base, "outside"),
    control = path.join(owned, "control");
  fs.mkdirSync(control, { recursive: true });
  fs.mkdirSync(path.join(outside, "control"), { recursive: true });
  fs.writeFileSync(path.join(outside, "control/sentinel"), "untouched");
  const directories = new CompareDirectories();
  directories.own(owned);
  directories.own(control);
  try {
    fs.renameSync(owned, path.join(base, "original"));
    fs.symlinkSync(outside, owned, process.platform === "win32" ? "junction" : "dir");
    assert.throws(() => directories.remove(control), /replaced owned ancestor/);
    directories.remove(owned);
    assert.equal(fs.readFileSync(path.join(outside, "control/sentinel"), "utf8"), "untouched");
  } finally {
    const owner = new CompareDirectories();
    owner.own(base);
    owner.remove(base);
  }
});
