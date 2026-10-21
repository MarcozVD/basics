import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GraphData, VaultStats } from "@marcozvd/basics-core";
import { type NoteData, readActivity, Vault } from "@marcozvd/basics-core";
import { test } from "vitest";
import { createApp } from "../src/server/app.js";

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");

function tempVault(): Vault {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-"));
  fs.cpSync(SEED, dir, { recursive: true });
  return Vault.load(dir);
}

const HOST = { host: "localhost:4747" };

function jsonInit(body: unknown, headers: Record<string, string> = {}, method = "POST"): RequestInit {
  return {
    method,
    headers: { ...HOST, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  };
}

const MCP_HEADERS = { ...HOST, "content-type": "application/json", accept: "application/json, text/event-stream" };

function mcpPost(app: ReturnType<typeof createApp>, body: unknown, sessionId?: string): Promise<Response> {
  return app.request("/mcp", {
    method: "POST",
    headers: { ...MCP_HEADERS, ...(sessionId ? { "mcp-session-id": sessionId } : {}) },
    body: JSON.stringify(body),
  });
}

function initialize(name: string): unknown {
  return {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name, version: "0.0.0" } },
  };
}

test("GET /api/health returns ok", async () => {
  const v = tempVault();
  const app = createApp({ root: v.root });
  const res = await app.request("/api/health", { headers: HOST });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean };
  assert.equal(body.ok, true);
});

test("GET /api/stats returns vault shape", async () => {
  const v = tempVault();
  const app = createApp({ root: v.root });
  const res = await app.request("/api/stats", { headers: HOST });
  assert.equal(res.status, 200);
  const body = (await res.json()) as VaultStats;
  assert.equal(body.total, 25);
  assert.equal(body.counts.tech, 9);
  assert.equal(body.counts.layer, 5);
  assert.equal(body.inbox, 0);
  assert.ok(body.recent.length > 0 && body.recent.length <= 6);
});

test("GET /api/stats reports proposals and broken links", async () => {
  const v = tempVault();
  const note = v.get("fastapi");
  assert.ok(note);
  v.writeNote("fastapi", { ...note.data, related: ["ghost-tech"] } as NoteData, note.body, { expectedHash: note.hash });
  v.propose("fastapi", note.data as NoteData, "# Proposed", { proposed_by: "test", reason: "test" });
  const app = createApp({ root: v.root });
  const res = await app.request("/api/stats", { headers: HOST });
  assert.equal(res.status, 200);
  const body = (await res.json()) as VaultStats;
  assert.equal(body.inbox, 1);
  assert.ok(body.brokenLinks.some((link) => link.from === "fastapi" && link.to === "ghost-tech"));
});

test("POST /api/context renders stack markdown", async () => {
  const v = tempVault();
  const app = createApp({ root: v.root });
  const res = await app.request("/api/context", jsonInit({ techIds: ["fastapi"] }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { markdown: string };
  assert.match(body.markdown, /FastAPI/);
});

test("POST /api/export merges existing agent files", async () => {
  const v = tempVault();
  const app = createApp({ root: v.root });
  const res = await app.request(
    "/api/export",
    jsonInit({ stack: ["fastapi"], targets: ["agents"], existing: { "AGENTS.md": "# Custom rules\n" } }),
  );
  assert.equal(res.status, 200);
  const files = (await res.json()) as { path: string; content: string }[];
  const agents = files.find((file) => file.path === "AGENTS.md")?.content;
  assert.ok(agents?.startsWith("# Custom rules\n\n<!-- basics:start -->"));
});

test("POST /api/export maps non-tech ids to 400 invalid", async () => {
  const v = tempVault();
  const app = createApp({ root: v.root });
  const res = await app.request("/api/export", jsonInit({ stack: ["backend"], targets: ["agents"] }));
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: string; message: string };
  assert.equal(body.error, "invalid");
  assert.match(body.message, /backend \(not a tech note\)/);
});

test("GET /api/notes filters tech notes by layer", async () => {
  const v = tempVault();
  const app = createApp({ root: v.root });
  const res = await app.request("/api/notes?type=tech&layer=testing", { headers: HOST });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { id: string }[];
  assert.equal(body.length, 3);
});

test("PUT /api/notes with a stale hash returns 409 and actualHash", async () => {
  const v = tempVault();
  const note = v.get("fastapi");
  assert.ok(note);
  const app = createApp({ root: v.root });
  const res = await app.request("/api/notes/fastapi", jsonInit({ data: note.data, body: note.body, expectedHash: "stale" }, {}, "PUT"));
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string; actualHash?: string };
  assert.equal(body.error, "conflict");
  assert.ok(body.actualHash);
});

test("PUT /api/notes with the correct hash updates the note", async () => {
  const v = tempVault();
  const note = v.get("fastapi");
  assert.ok(note);
  const app = createApp({ root: v.root });
  const res = await app.request("/api/notes/fastapi", {
    method: "PUT",
    headers: { ...HOST, "content-type": "application/json" },
    body: JSON.stringify({ data: note.data, body: "# Updated FastAPI", expectedHash: note.hash }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { body: string; hash: string };
  assert.equal(body.body, "# Updated FastAPI");
  assert.notEqual(body.hash, note.hash);
});

test("POST /api/notes with an existing id returns 409 exists", async () => {
  const v = tempVault();
  const note = v.get("fastapi");
  assert.ok(note);
  const app = createApp({ root: v.root });
  const res = await app.request("/api/notes", jsonInit({ id: "fastapi", data: note.data, body: note.body }));
  assert.equal(res.status, 409);
  const body = (await res.json()) as { error: string };
  assert.equal(body.error, "exists");
});

test("rejects a non-local Host header", async () => {
  const v = tempVault();
  const app = createApp({ root: v.root });
  const res = await app.request("/api/health", { headers: { host: "evil.com" } });
  assert.equal(res.status, 403);
});

test("rejects a non-local Origin header on writes", async () => {
  const v = tempVault();
  const app = createApp({ root: v.root });
  const res = await app.request("/api/notes", jsonInit({}, { origin: "https://evil.com" }));
  assert.equal(res.status, 403);
});

test("inbox lists a proposal and approves it", async () => {
  const v = tempVault();
  const note = v.get("fastapi");
  assert.ok(note);
  v.propose("fastapi", note.data as NoteData, "# Proposed", { proposed_by: "test", reason: "test" });
  const app = createApp({ root: v.root });

  const listed = await app.request("/api/inbox", { headers: HOST });
  assert.equal(listed.status, 200);
  const inbox = (await listed.json()) as { id: string }[];
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].id, "fastapi");

  const approved = await app.request("/api/inbox/fastapi/approve", jsonInit({ body: "# Approved" }));
  assert.equal(approved.status, 200);

  const empty = await app.request("/api/inbox", { headers: HOST });
  assert.deepEqual(await empty.json(), []);
});

test("MCP tools/list returns 10 tools", async () => {
  const v = tempVault();
  const app = createApp({ root: v.root });

  const init = await mcpPost(app, initialize("test"));
  assert.equal(init.status, 200);
  const sessionId = init.headers.get("mcp-session-id");
  assert.ok(sessionId);

  const res = await mcpPost(app, { jsonrpc: "2.0", id: 2, method: "tools/list" }, sessionId);
  assert.equal(res.status, 200);
  const body = (await res.json()) as { result?: { tools?: unknown[] } };
  assert.equal(body.result?.tools?.length, 10);
});

test("MCP HTTP sessions keep the client name in activity", async () => {
  const v = tempVault();
  const app = createApp({ root: v.root });

  const init = await mcpPost(app, initialize("test-agent"));
  assert.equal(init.status, 200);
  const sessionId = init.headers.get("mcp-session-id");
  assert.ok(sessionId);

  const initialized = await mcpPost(app, { jsonrpc: "2.0", method: "notifications/initialized" }, sessionId);
  assert.equal(initialized.status, 202);

  const call = await mcpPost(
    app,
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_note", arguments: { id: "fastapi" } } },
    sessionId,
  );
  assert.equal(call.status, 200);

  const [event] = readActivity(v.root);
  assert.equal(event.agent, "test-agent");
  assert.equal(event.tool, "get_note");
  assert.deepEqual(event.noteIds, ["fastapi"]);

  const deleted = await app.request("/mcp", { method: "DELETE", headers: { ...HOST, "mcp-session-id": sessionId } });
  assert.equal(deleted.status, 200);
  const afterDelete = await mcpPost(
    app,
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_note", arguments: { id: "fastapi" } } },
    sessionId,
  );
  assert.equal(afterDelete.status, 404);
});

test("GET /api/graph returns nodes and edges, broken targets only on request", async () => {
  const v = tempVault();
  const note = v.get("fastapi");
  assert.ok(note);
  v.writeNote("fastapi", { ...note.data, related: ["ghost-tech"] } as NoteData, note.body, { expectedHash: note.hash });
  const app = createApp({ root: v.root });

  const res = await app.request("/api/graph", { headers: HOST });
  assert.equal(res.status, 200);
  const graph = (await res.json()) as GraphData;
  assert.equal(graph.nodes.length, 25);
  assert.ok(graph.nodes.every((node) => node.type !== "missing"));
  assert.ok(graph.edges.length > 0 && graph.edges.every((edge) => edge.kind === "link"));
  const ids = new Set(graph.nodes.map((node) => node.id));
  assert.ok(graph.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target)));
  const fastapi = graph.nodes.find((node) => node.id === "fastapi");
  assert.ok(fastapi && fastapi.type === "tech" && fastapi.degree > 0);
  const pairs = graph.edges.map((edge) => [edge.source, edge.target].sort().join(" "));
  assert.equal(new Set(pairs).size, pairs.length);

  const withBroken = (await (await app.request("/api/graph?broken=1", { headers: HOST })).json()) as GraphData;
  const ghost = withBroken.nodes.find((node) => node.id === "ghost-tech");
  assert.ok(ghost && ghost.type === "missing" && ghost.degree === 1);
  assert.ok(withBroken.edges.some((edge) => edge.source === "fastapi" && edge.target === "ghost-tech" && edge.kind === "broken"));
});
