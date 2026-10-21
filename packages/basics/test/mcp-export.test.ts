import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { test } from "vitest";
import { createMcpServer } from "../src/mcp/tools.js";

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");
const NOTE = "Write these files into the project root; basics never writes outside the vault.";

function tempVault(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-mcp-export-"));
  fs.cpSync(SEED, dir, { recursive: true });
  return dir;
}

test("export_project returns the ExportFile[] as JSON text", async () => {
  const root = tempVault();
  const server = createMcpServer(() => root);
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const result = await client.callTool({ name: "export_project", arguments: { stack: ["fastapi"], targets: ["agents"] } });
    assert.ok(!result.isError);
    const [first] = result.content as { type: string; text: string }[];
    assert.ok(first.text.endsWith(`\n\n${NOTE}`));

    const files = JSON.parse(first.text.slice(0, -`\n\n${NOTE}`.length)) as { path: string; content: string }[];
    assert.deepEqual(
      files.map((file) => file.path),
      ["STACK.md", "AGENTS.md"],
    );
    assert.ok(files[1].content.includes("<!-- basics:start -->"));
    assert.equal(fs.readdirSync(root).includes("AGENTS.md"), false);
  } finally {
    await client.close();
    await server.close();
  }
});

test("export_project returns a tool error for non-tech ids", async () => {
  const root = tempVault();
  const server = createMcpServer(() => root);
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const result = await client.callTool({ name: "export_project", arguments: { stack: ["backend"] } });
    assert.equal(result.isError, true);
    const [first] = result.content as { type: string; text: string }[];
    assert.equal(first.text, "unknown tech ids: backend (not a tech note)");
  } finally {
    await client.close();
    await server.close();
  }
});

test("export_project merges existing file contents", async () => {
  const root = tempVault();
  const server = createMcpServer(() => root);
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  try {
    const result = await client.callTool({
      name: "export_project",
      arguments: { stack: ["fastapi"], targets: ["agents"], existing: { "AGENTS.md": "# Custom rules\n" } },
    });
    assert.ok(!result.isError);
    const [first] = result.content as { type: string; text: string }[];
    assert.ok(first.text.includes("# Custom rules\\n"));
    assert.ok(first.text.includes("basics:start"));
  } finally {
    await client.close();
    await server.close();
  }
});
