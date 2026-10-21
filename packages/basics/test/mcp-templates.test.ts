import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Vault } from "@marcozvd/basics-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { test } from "vitest";
import { createMcpServer } from "../src/mcp/tools.js";

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");
const NOTE = "Write missing files into the project; never overwrite existing files.";

function tempVault(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-mcp-templates-"));
  fs.cpSync(SEED, dir, { recursive: true });
  const vault = Vault.load(dir);
  const check = vault.get("fastapi-endpoint-tests");
  assert.ok(check);
  vault.writeNote(check.id, check.data, `${check.body}\n\n\`\`\`python file=tests/test_health.py\nprint("ok")\n\`\`\``);
  return dir;
}

test("get_check_templates returns the stack templates as JSON", async () => {
  const root = tempVault();
  const server = createMcpServer(() => root);
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const result = await client.callTool({ name: "get_check_templates", arguments: { stack: ["fastapi"] } });
    assert.ok(!result.isError);
    const [first] = result.content as { type: string; text: string }[];
    assert.ok(first.text.endsWith(`\n\n${NOTE}`));

    const templates = JSON.parse(first.text.slice(0, -`\n\n${NOTE}`.length));
    assert.deepEqual(templates, [
      { check: "fastapi-endpoint-tests", file: "tests/test_health.py", lang: "python", content: 'print("ok")' },
    ]);
  } finally {
    await client.close();
    await server.close();
  }
});

test("get_check_templates returns an empty list for checks without templates", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-mcp-templates-empty-"));
  fs.cpSync(SEED, root, { recursive: true });
  const server = createMcpServer(() => root);
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const result = await client.callTool({ name: "get_check_templates", arguments: { stack: ["fastapi"] } });
    assert.ok(!result.isError);
    const [first] = result.content as { type: string; text: string }[];
    assert.equal(first.text, `[]\n\n${NOTE}`);
  } finally {
    await client.close();
    await server.close();
  }
});
