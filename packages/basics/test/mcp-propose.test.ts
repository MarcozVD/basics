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

function tempVault(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-mcp-propose-"));
  fs.cpSync(SEED, dir, { recursive: true });
  return dir;
}

async function withClient(fn: (call: (name: string, args: Record<string, unknown>) => ReturnType<Client["callTool"]>) => Promise<void>) {
  const root = tempVault();
  const server = createMcpServer(() => root);
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    await fn((name, args) => client.callTool({ name, arguments: args }));
    return root;
  } finally {
    await client.close();
    await server.close();
  }
}

const FRONTMATTER = { kind: "framework", layer: "backend", use_when: ["admin CRUD"] };

test("propose_note rejects agent names that spoof pack provenance", async () => {
  await withClient(async (call) => {
    const result = await call("propose_note", {
      id: "django",
      type: "tech",
      frontmatter: FRONTMATTER,
      body: "# Django",
      reason: "test",
      agent: "pack:python-api@9.9.9",
    });
    assert.equal(result.isError, true);
    const [first] = result.content as { type: string; text: string }[];
    assert.equal(first.text, "agent names starting with 'pack:' are reserved");
  });
});

test("propose_note accepts a normal agent", async () => {
  const root = await withClient(async (call) => {
    const result = await call("propose_note", {
      id: "django",
      type: "tech",
      frontmatter: FRONTMATTER,
      body: "# Django",
      reason: "test",
      agent: "claude-code",
    });
    assert.ok(!result.isError);
  });
  assert.equal(Vault.load(root).listProposals()[0]?.meta.proposed_by, "claude-code");
});
