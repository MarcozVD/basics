import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { parseFrontmatter, proposalDetail, serializeNote, stampApproved, Vault } from "../src/index.js";

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");

function tempVault(): Vault {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-"));
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

/** The file as the diff would show it: parsed and re-serialized without the `updated` stamp. */
function writtenWithoutUpdated(file: string): string {
  const { data, content } = parseFrontmatter(fs.readFileSync(file, "utf8"));
  const copy = { ...(data as Record<string, unknown>) };
  delete copy.updated;
  return serializeNote(copy, content.trim());
}

/** Propose, capture the preview, approve, and assert the preview is exactly the written file. */
function assertPreviewMatchesFile(v: Vault, id: string, proposedBy: string, data = techData(), body = `# ${id}`): string {
  v.propose(id, data, body, { proposed_by: proposedBy, reason: "test" });
  const proposal = v.getProposal(id);
  assert.ok(proposal);
  const preview = proposalDetail(v, proposal).proposedText;
  const file = v.approve(id);
  assert.equal(preview, writtenWithoutUpdated(file));
  return preview;
}

test("stampApproved is the one place that decides the approve source", () => {
  assert.equal(stampApproved(techData(), { proposed_by: "claude-code" }).source, "agent:claude-code");
  assert.equal(stampApproved(techData(), { proposed_by: "agent:claude-code" }).source, "agent:claude-code");
  assert.equal(stampApproved(techData(), { proposed_by: "pack:python-api@1.0.0" }).source, "pack:python-api@1.0.0");
  assert.ok(!("updated" in stampApproved(techData(), { proposed_by: "claude-code" })));
});

test("a create proposal previews the source approve writes", () => {
  const v = tempVault();
  const preview = assertPreviewMatchesFile(v, "django", "claude-code");

  assert.match(preview, /^source: '?agent:claude-code'?$/m);
  assert.equal(v.get("django")?.data.source, "agent:claude-code");
});

test("an update proposal previews the source approve writes", () => {
  const v = tempVault();
  const note = v.get("fastapi");
  assert.ok(note);

  const preview = assertPreviewMatchesFile(v, "fastapi", "claude-code", { ...note.data, title: "FastAPI revisado" }, note.body);

  assert.match(preview, /^title: FastAPI revisado$/m);
  assert.match(preview, /^source: '?agent:claude-code'?$/m);
  assert.equal(v.get("fastapi")?.data.source, "agent:claude-code");
});

test("a pack proposal keeps its pack source in the preview and the file", () => {
  const v = tempVault();
  const preview = assertPreviewMatchesFile(v, "django", "pack:python-api@1.0.0");

  assert.match(preview, /^source: '?pack:python-api@1\.0\.0'?$/m);
  assert.equal(v.get("django")?.data.source, "pack:python-api@1.0.0");
});

test("an agent:-prefixed proposed_by is not double-prefixed", () => {
  const v = tempVault();
  const preview = assertPreviewMatchesFile(v, "django", "agent:claude-code");

  assert.match(preview, /^source: '?agent:claude-code'?$/m);
  assert.ok(!preview.includes("agent:agent:"));
  assert.equal(v.get("django")?.data.source, "agent:claude-code");
});
