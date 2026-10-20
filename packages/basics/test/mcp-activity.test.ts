import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readActivity } from "@marcozvd/basics-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { test } from "vitest";
import { createMcpServer } from "../src/mcp/tools.js";
import { createApp } from "../src/server/app.js";

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");
const HOST = { host: "localhost:4747" };

function tempVault(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-mcp-activity-"));
  fs.cpSync(SEED, dir, { recursive: true });
  return dir;
}

test("MCP tool calls are recorded with the client name", async () => {
  const root = tempVault();
  const server = createMcpServer(() => root);
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const result = await client.callTool({ name: "get_note", arguments: { id: "fastapi" } });
    assert.ok(!result.isError);

    const [event] = readActivity(root);
    assert.equal(event.agent, "test-agent");
    assert.equal(event.tool, "get_note");
    assert.deepEqual(event.noteIds, ["fastapi"]);
  } finally {
    await client.close();
    await server.close();
  }
});

test("GET /api/activity returns the recorded event", async () => {
  const root = tempVault();
  const server = createMcpServer(() => root);
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    await client.callTool({ name: "get_note", arguments: { id: "fastapi" } });
    const app = createApp({ root });
    const res = await app.request("/api/activity", { headers: HOST });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { agent: string; tool: string; noteIds: string[] }[];
    assert.equal(body.length, 1);
    assert.equal(body[0].agent, "test-agent");
    assert.equal(body[0].tool, "get_note");
    assert.deepEqual(body[0].noteIds, ["fastapi"]);
  } finally {
    await client.close();
    await server.close();
  }
});
