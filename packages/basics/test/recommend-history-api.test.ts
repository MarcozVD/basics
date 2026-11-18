import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadVaultConfig, type Recommendation, Vault } from "@marcozvd/basics-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { test } from "vitest";
import { createMcpServer } from "../src/mcp/tools.js";
import { createApp } from "../src/server/app.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-history-api-"));
  fs.cpSync(path.resolve(import.meta.dirname, "../../core/test/fixtures/history-vault"), root, { recursive: true });
  return root;
}
test("vault history API persists per vault, validates weight and preserves unrelated config", async () => {
  const root = fixture();
  try {
    fs.mkdirSync(path.join(root, ".basics"), { recursive: true });
    fs.writeFileSync(path.join(root, ".basics/config.json"), JSON.stringify({ other: { kept: true } }));
    const app = createApp({ root });
    const headers = { host: "localhost:4820", "content-type": "application/json" };
    const get = await app.request("/api/vault-config", { headers });
    assert.equal(get.status, 200);
    assert.equal((await get.json()).history.enabled, true);
    const save = await app.request("/api/vault-config/history", {
      method: "PUT",
      headers,
      body: JSON.stringify({ enabled: false, weight: 0.5 }),
    });
    assert.equal(save.status, 200);
    assert.deepEqual(loadVaultConfig(root).history, { enabled: false, weight: 0.5 });
    assert.deepEqual(loadVaultConfig(root).other, { kept: true });
    for (const enabled of [true, false]) {
      const toggle = await app.request("/api/vault-config/history", { method: "PUT", headers, body: JSON.stringify({ enabled }) });
      assert.equal(toggle.status, 200);
      assert.deepEqual(await toggle.json(), { enabled, weight: 0.5 });
      assert.deepEqual(loadVaultConfig(root).history, { enabled, weight: 0.5 });
    }
    const bad = await app.request("/api/vault-config/history", { method: "PUT", headers, body: JSON.stringify({ weight: 100 }) });
    assert.equal(bad.status, 400);
    assert.equal(loadVaultConfig(root).history.weight, 0.5);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("MCP returns history and real project list, and explicit outcome is proposed before taking effect", async () => {
  const root = fixture();
  const server = createMcpServer(() => root);
  const client = new Client({ name: "history-test", version: "0.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(b), client.connect(a)]);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: args });
    assert.ok(!result.isError);
    return JSON.parse((result.content as { text: string }[])[0].text);
  };
  try {
    const result = (await call("recommend_stack", { description: "service" })) as Recommendation;
    const boost = result.layers.backend[0].score_breakdown.history!;
    assert.ok(boost > 1, "history scales with the layer score");
    assert.equal(result.layers.backend[0].history_projects?.[0].id, "shipped");
    await call("record_project_outcome", { project: "shipped", summary: "Explicit failure", outcome: "failed" });
    const vault = Vault.load(root);
    assert.equal(vault.get("shipped")?.data.type, "project");
    assert.equal((await call("recommend_stack", { description: "service" })).layers.backend[0].score_breakdown.history, boost);
    vault.approve("shipped");
    const after = (await call("recommend_stack", { description: "service" })) as Recommendation;
    assert.equal(after.layers.backend.find((c) => c.id === "beta")?.score_breakdown.history, -boost);
    const note = vault.get("shipped")!;
    vault.writeNote(
      "cancel",
      { ...note.data, type: "project", outcome: "successful", stack: { backend: ["beta"] } },
      "Opposing accepted result",
    );
    const cancelled = (await call("recommend_stack", { description: "service" })) as Recommendation;
    const beta = cancelled.layers.backend.find((c) => c.id === "beta")!;
    assert.equal(beta.score_breakdown.history, undefined);
    assert.equal(beta.history_projects, undefined, "cancelled evidence stays off the compact wire");
  } finally {
    await client.close();
    await server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
