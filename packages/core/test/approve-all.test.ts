import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { Vault } from "../src/index.js";

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");

function tempVault(): Vault {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-approve-all-"));
  fs.cpSync(SEED, dir, { recursive: true });
  return Vault.load(dir);
}

const techData = () => ({
  type: "tech" as const,
  kind: "framework" as const,
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

test("approveMany approves every pending proposal and keeps conflicts for review", () => {
  const vault = tempVault();
  const fastapi = vault.get("fastapi");
  assert.ok(fastapi);

  vault.propose("fastapi", fastapi.data, `${fastapi.body}\nproposed`, { proposed_by: "agent-a", reason: "change fastapi" });
  vault.propose("django", techData(), "# Django", { proposed_by: "agent-a", reason: "add django" });
  vault.propose("svelte", techData(), "# Svelte", { proposed_by: "agent-b", reason: "add svelte" });

  // The note changes after the proposal was written, so its recorded base hash is stale.
  vault.writeNote("fastapi", fastapi.data, `${fastapi.body}\nlocal edit`);

  const result = vault.approveMany();
  assert.deepEqual([...result.approved].sort(), ["django", "svelte"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.id, "fastapi");
  assert.match(result.failed[0]?.error ?? "", /changed since this proposal was created/);

  assert.equal(vault.get("django")?.data.source, "agent:agent-a");
  assert.equal(vault.get("svelte")?.data.source, "agent:agent-b");
  assert.match(vault.get("fastapi")?.body ?? "", /local edit/);
  assert.ok(vault.getProposal("fastapi"));
  assert.deepEqual(
    vault.listProposals().map((proposal) => proposal.id),
    ["fastapi"],
  );
});

test("approveMany reports inbox files with invalid frontmatter and keeps them", () => {
  const vault = tempVault();
  vault.propose("django", techData(), "# Django", { proposed_by: "agent-a", reason: "add django" });

  const inbox = path.join(vault.root, "inbox");
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(path.join(inbox, "broken.md"), "---\ntype: tech\nproposal:\n  action: create\n---\n# Broken\n");

  const result = vault.approveMany();
  assert.deepEqual(result.approved, ["django"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.id, "broken");
  assert.match(result.failed[0]?.error ?? "", /invalid proposal frontmatter/);
  assert.ok(fs.existsSync(path.join(inbox, "broken.md")));
});

test("a proposal without base_hash still approves after the note changes", () => {
  const vault = tempVault();
  const fastapi = vault.get("fastapi");
  assert.ok(fastapi);
  vault.propose("fastapi", fastapi.data, `${fastapi.body}\nproposed`, { proposed_by: "agent-a", reason: "change fastapi" });

  // Simulate an older proposal that predates base_hash tracking.
  const inboxFile = path.join(vault.root, "inbox", "fastapi.md");
  const raw = fs.readFileSync(inboxFile, "utf8").replace(/^ {2}base_hash: .*\n/m, "");
  fs.writeFileSync(inboxFile, raw);
  vault.writeNote("fastapi", fastapi.data, `${fastapi.body}\nlocal edit`);

  assert.equal(vault.approve("fastapi"), path.join(vault.root, "tech", "fastapi.md"));
  assert.match(vault.get("fastapi")?.body ?? "", /proposed/);
  assert.equal(vault.listProposals().length, 0);
});
