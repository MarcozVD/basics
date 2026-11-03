import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { VaultCache } from "@marcozvd/basics-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { test } from "vitest";
import { createMcpServer } from "../src/mcp/tools.js";

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");

function tempVault(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-cache-mcp-"));
  fs.cpSync(SEED, dir, { recursive: true });
  return dir;
}

async function withClient(
  root: string,
  fn: (client: Client, cache: VaultCache) => Promise<void>,
  cache = new VaultCache(root, { verify: true }),
): Promise<void> {
  const server = createMcpServer(() => root, { cache });
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    await fn(client, cache);
  } finally {
    await client.close();
    await server.close();
  }
}

function text(result: Awaited<ReturnType<Client["callTool"]>>): string {
  return (result.content as { type: string; text: string }[])[0].text;
}

test("a note edited outside the app is visible in the next tool call", async () => {
  const root = tempVault();

  await withClient(root, async (client, cache) => {
    const first = await client.callTool({ name: "get_note", arguments: { id: "fastapi" } });
    assert.ok(!first.isError);
    assert.match(text(first), /# FastAPI/);
    const version = cache.version;

    const file = path.join(root, "tech", "fastapi.md");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("# FastAPI", "# FastAPI edited outside"));
    // mtime is the signal; make sure it is newer even on a coarse filesystem clock.
    const at = new Date(Date.now() + 2000);
    fs.utimesSync(file, at, at);

    const second = await client.callTool({ name: "get_note", arguments: { id: "fastapi" } });
    assert.match(text(second), /FastAPI edited outside/);
    assert.ok(cache.version > version, "the vault was reloaded");
  });
});

test("a note added and deleted on disk shows up in the search results", async () => {
  const root = tempVault();

  await withClient(root, async (client) => {
    fs.writeFileSync(
      path.join(root, "tech", "nanostores.md"),
      "---\ntype: tech\nkind: library\ntitle: Nanostores\nlayer: frontend\nuse_when:\n  - shared state without a provider\n---\n\n# Nanostores\n",
    );
    const found = await client.callTool({ name: "search_vault", arguments: { query: "nanostores" } });
    assert.match(text(found), /nanostores/);

    fs.rmSync(path.join(root, "tech", "nanostores.md"));
    const gone = await client.callTool({ name: "search_vault", arguments: { query: "nanostores" } });
    assert.doesNotMatch(text(gone), /nanostores/);
  });
});

test("a repeated overview call is served from the cache and rebuilt after an edit", async () => {
  const root = tempVault();

  await withClient(root, async (client, cache) => {
    const first = await client.callTool({ name: "get_vault_overview", arguments: {} });
    const version = cache.version;
    const second = await client.callTool({ name: "get_vault_overview", arguments: {} });
    assert.equal(text(second), text(first), "same response, built once");
    assert.equal(cache.version, version, "no reload between the two calls");

    const file = path.join(root, "tech", "fastapi.md");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("title: FastAPI", "title: FastAPI edited"));
    const at = new Date(Date.now() + 2000);
    fs.utimesSync(file, at, at);

    const third = await client.callTool({ name: "get_vault_overview", arguments: {} });
    assert.match(text(third), /FastAPI edited/);
    assert.ok(cache.version > version, "the memo was invalidated with the vault");
  });
});

test("a tool that writes invalidates the cache", async () => {
  const root = tempVault();

  await withClient(root, async (client, cache) => {
    await client.callTool({ name: "search_vault", arguments: { query: "fastapi" } });
    const version = cache.version;

    const proposed = await client.callTool({
      name: "propose_note",
      arguments: {
        id: "valkey",
        type: "tech",
        frontmatter: { kind: "database", title: "Valkey", layer: "backend" },
        body: "# Valkey\n\nRedis-compatible cache.",
        reason: "the project needs a cache",
        agent: "test-agent",
      },
    });
    assert.ok(!proposed.isError);
    assert.equal(cache.version, version, "nothing reloaded yet: the invalidation is lazy");

    // The next tool call reloads, so anything the write changed is visible from disk.
    const listed = await client.callTool({ name: "list_proposals", arguments: {} });
    assert.match(text(listed), /valkey/);
    assert.ok(cache.version > version, "propose_note invalidated the cached vault");
  });
});
