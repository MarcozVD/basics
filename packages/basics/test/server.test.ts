import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type NoteData, Vault } from "@marcozvd/basics-core";
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

test("GET /api/health returns ok", async () => {
  const v = tempVault();
  const app = createApp({ root: v.root });
  const res = await app.request("/api/health", { headers: HOST });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { ok: boolean };
  assert.equal(body.ok, true);
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

test("MCP tools/list returns 7 tools", async () => {
  const v = tempVault();
  const app = createApp({ root: v.root });
  const mcp = (body: unknown) =>
    app.request("/mcp", {
      method: "POST",
      headers: {
        ...HOST,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify(body),
    });

  let res = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  if (res.status !== 200) {
    await mcp({
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "0.0.0" } },
    });
    res = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  }
  assert.equal(res.status, 200);
  const body = (await res.json()) as { result?: { tools?: unknown[] } };
  assert.equal(body.result?.tools?.length, 7);
});
