import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { Vault } from "../src/index.js";

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");

function tempVault(): Vault {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-reject-all-"));
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

test("rejectMany deletes every pending proposal and reports unreadable files", () => {
  const vault = tempVault();
  vault.propose("django", techData(), "# Django", { proposed_by: "agent-a", reason: "add django" });
  vault.propose("svelte", techData(), "# Svelte", { proposed_by: "agent-b", reason: "add svelte" });

  const inbox = path.join(vault.root, "inbox");
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(path.join(inbox, "broken.md"), "---\ntype: tech\nproposal:\n  action: create\n---\n# Broken\n");

  const result = vault.rejectMany();
  assert.deepEqual([...result.rejected].sort(), ["django", "svelte"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.id, "broken");
  assert.deepEqual(vault.listProposals(), []);
  // Rejecting never writes the notes into the vault.
  assert.equal(vault.get("django"), undefined);
});

test("rejectMany honours pack, agent and action filters", () => {
  const vault = tempVault();
  vault.propose("django", techData(), "# Django", { proposed_by: "pack:python-api@1.0.0", reason: "add" });
  vault.propose("svelte", techData(), "# Svelte", { proposed_by: "agent-b", reason: "add" });

  const result = vault.rejectMany({ pack: "python-api" });
  assert.deepEqual(result.rejected, ["django"]);
  assert.deepEqual(
    vault.listProposals().map((proposal) => proposal.id),
    ["svelte"],
  );
});

test("rejectMany with ids rejects only those proposals and reports unknown ids", () => {
  const vault = tempVault();
  vault.propose("django", techData(), "# Django", { proposed_by: "agent-a", reason: "add" });
  vault.propose("svelte", techData(), "# Svelte", { proposed_by: "agent-a", reason: "add" });

  const result = vault.rejectMany({ ids: ["django", "ghost"] });
  assert.deepEqual(result.rejected, ["django"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.id, "ghost");
  assert.match(result.failed[0]?.error ?? "", /no proposal "ghost"/);
  assert.deepEqual(
    vault.listProposals().map((proposal) => proposal.id),
    ["svelte"],
  );
});

test("approveMany with ids approves only those proposals and reports unknown ids", () => {
  const vault = tempVault();
  vault.propose("django", techData(), "# Django", { proposed_by: "agent-a", reason: "add" });
  vault.propose("svelte", techData(), "# Svelte", { proposed_by: "agent-a", reason: "add" });

  const result = vault.approveMany({ ids: ["svelte", "ghost"] });
  assert.deepEqual(result.approved, ["svelte"]);
  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]?.id, "ghost");
  assert.equal(vault.get("svelte")?.data.source, "agent:agent-a");
  assert.deepEqual(
    vault.listProposals().map((proposal) => proposal.id),
    ["django"],
  );
});
