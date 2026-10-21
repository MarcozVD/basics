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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-mcp-outcome-"));
  fs.cpSync(SEED, dir, { recursive: true });
  Vault.load(dir).writeNote(
    "demo",
    {
      type: "project",
      title: "Demo",
      status: "active",
      path: "/tmp/demo",
      stack: { backend: ["fastapi"] },
      lessons: [],
      tags: [],
      source: "manual",
    },
    "# Demo",
  );
  return dir;
}

async function withClient(name: string, fn: (call: Client["callTool"]) => Promise<void>): Promise<string> {
  const root = tempVault();
  const server = createMcpServer(() => root);
  const client = new Client({ name, version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    await fn((request) => client.callTool(request));
    return root;
  } finally {
    await client.close();
    await server.close();
  }
}

test("record_project_outcome proposes project and tech updates", async () => {
  const root = await withClient("test-agent", async (call) => {
    const result = await call({
      name: "record_project_outcome",
      arguments: {
        project: "demo",
        summary: "Shipped the health endpoint",
        lessons: ["Keep handlers small"],
        tech_updates: [{ id: "fastapi", add_use_when: ["health checks"], lesson: "Use TestClient" }],
      },
    });
    assert.ok(!result.isError);
    const [first] = result.content as { type: string; text: string }[];
    assert.deepEqual(JSON.parse(first.text), { status: "pending_review", proposals: ["demo", "fastapi"] });
  });

  const vault = Vault.load(root);
  assert.equal(vault.listProposals().length, 2);
  assert.equal(vault.getProposal("demo")?.meta.proposed_by, "test-agent");
});

test("record_project_outcome rejects pack agents", async () => {
  await withClient("pack:python-api@9.9.9", async (call) => {
    const result = await call({ name: "record_project_outcome", arguments: { project: "demo", summary: "nope" } });
    assert.equal(result.isError, true);
    const [first] = result.content as { type: string; text: string }[];
    assert.equal(first.text, "agent names starting with 'pack:' are reserved");
  });
});
