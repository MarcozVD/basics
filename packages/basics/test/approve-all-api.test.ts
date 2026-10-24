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

test("POST /api/inbox/approve-all accepts an empty body and an agent filter", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-approve-all-api-"));
  const app = createApp({ root });
  const request = (url: string, init: RequestInit = {}) =>
    app.request(url, { ...init, headers: { host: "localhost", ...(init.headers as Record<string, string> | undefined) } });

  let vault = Vault.load(root);
  vault.writeNote("alpha", techData(), "# Alpha");
  vault.writeNote("beta", techData(), "# Beta");
  const alpha = vault.get("alpha");
  const beta = vault.get("beta");
  assert.ok(alpha);
  assert.ok(beta);
  vault.propose("alpha", alpha.data, `${alpha.body}\nproposed`, { proposed_by: "agent-a", reason: "update alpha" });
  vault.propose("beta", beta.data, `${beta.body}\nproposed`, { proposed_by: "agent-b", reason: "update beta" });

  const empty = await request("/api/inbox/approve-all", { method: "POST" });
  assert.equal(empty.status, 200);
  const emptyBody = (await empty.json()) as { approved: string[]; failed: { id: string; error: string }[] };
  assert.deepEqual([...emptyBody.approved].sort(), ["alpha", "beta"]);
  assert.deepEqual(emptyBody.failed, []);
  assert.equal(Vault.load(root).listProposals().length, 0);

  vault = Vault.load(root);
  const alphaAgain = vault.get("alpha");
  const betaAgain = vault.get("beta");
  assert.ok(alphaAgain);
  assert.ok(betaAgain);
  vault.propose("alpha", alphaAgain.data, `${alphaAgain.body}\nagain`, { proposed_by: "agent-a", reason: "update alpha" });
  vault.propose("beta", betaAgain.data, `${betaAgain.body}\nagain`, { proposed_by: "agent-b", reason: "update beta" });

  const agentRes = await request("/api/inbox/approve-all", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ agent: "agent-a" }),
  });
  assert.equal(agentRes.status, 200);
  const agentBody = (await agentRes.json()) as { approved: string[]; failed: { id: string; error: string }[] };
  assert.deepEqual(agentBody.approved, ["alpha"]);
  assert.deepEqual(agentBody.failed, []);
  assert.deepEqual(
    Vault.load(root)
      .listProposals()
      .map((proposal) => proposal.id),
    ["beta"],
  );
});
