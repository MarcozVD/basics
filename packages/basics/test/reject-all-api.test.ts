import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type NoteData, Vault } from "@marcozvd/basics-core";
import { test } from "vitest";
import { createApp } from "../src/server/app.js";

const techData = (): NoteData => ({
  type: "tech",
  kind: "framework",
  layer: "backend",
  use_when: [],
  avoid_when: [],
  performs_best: [],
  related: [],
  practices: [],
  checks: [],
  tags: [],
  source: "manual",
});

function propose(root: string, ids: string[]): void {
  const vault = Vault.load(root);
  for (const id of ids) {
    vault.writeNote(id, techData(), `# ${id}`);
    const note = vault.get(id);
    assert.ok(note);
    vault.propose(id, note.data, `${note.body}\nproposed`, { proposed_by: "agent-a", reason: `update ${id}` });
  }
}

test("POST /api/inbox/reject-all rejects every pending proposal", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-reject-all-api-"));
  const app = createApp({ root });
  const request = (url: string, init: RequestInit = {}) =>
    app.request(url, { ...init, headers: { host: "localhost", ...(init.headers as Record<string, string> | undefined) } });

  propose(root, ["alpha", "beta"]);

  const res = await request("/api/inbox/reject-all", { method: "POST" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { rejected: string[]; failed: { id: string; error: string }[] };
  assert.deepEqual([...body.rejected].sort(), ["alpha", "beta"]);
  assert.deepEqual(body.failed, []);
  assert.equal(Vault.load(root).listProposals().length, 0);
});

test("POST /api/inbox/reject-all with ids rejects a selection and reports unknown ids", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-reject-ids-api-"));
  const app = createApp({ root });
  const request = (url: string, init: RequestInit = {}) =>
    app.request(url, { ...init, headers: { host: "localhost", ...(init.headers as Record<string, string> | undefined) } });

  propose(root, ["alpha", "beta", "gamma"]);

  const res = await request("/api/inbox/reject-all", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: ["alpha", "ghost"] }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { rejected: string[]; failed: { id: string; error: string }[] };
  assert.deepEqual(body.rejected, ["alpha"]);
  assert.equal(body.failed.length, 1);
  assert.equal(body.failed[0]?.id, "ghost");
  assert.deepEqual(
    Vault.load(root)
      .listProposals()
      .map((proposal) => proposal.id)
      .sort(),
    ["beta", "gamma"],
  );
});

test("POST /api/inbox/approve-all with ids approves a selection", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-approve-ids-api-"));
  const app = createApp({ root });
  const request = (url: string, init: RequestInit = {}) =>
    app.request(url, { ...init, headers: { host: "localhost", ...(init.headers as Record<string, string> | undefined) } });

  propose(root, ["alpha", "beta", "gamma"]);

  const res = await request("/api/inbox/approve-all", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids: ["beta", "gamma"] }),
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { approved: string[]; failed: { id: string; error: string }[] };
  assert.deepEqual([...body.approved].sort(), ["beta", "gamma"]);
  assert.deepEqual(body.failed, []);
  assert.deepEqual(
    Vault.load(root)
      .listProposals()
      .map((proposal) => proposal.id),
    ["alpha"],
  );
});

test("POST /api/inbox/reject-all keeps the approve-all guards", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-reject-guard-api-"));
  const app = createApp({ root });
  const request = (url: string, init: RequestInit = {}) =>
    app.request(url, { ...init, headers: { host: "localhost", ...(init.headers as Record<string, string> | undefined) } });

  const res = await request("/api/inbox/reject-all", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ version: "1.0.0" }),
  });
  assert.equal(res.status, 400);
});
