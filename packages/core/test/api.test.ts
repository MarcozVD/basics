import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { ConflictError, listNotes, NotFoundError, proposalDetail, Vault } from "../src/index.js";

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

test("deleteNote removes the note and throws NotFoundError on the next call", () => {
  const v = tempVault();
  v.deleteNote("vitest");
  assert.equal(v.get("vitest"), undefined);
  assert.throws(() => v.deleteNote("vitest"), NotFoundError);
});

test("deleteNote throws ConflictError with a stale expectedHash", () => {
  const v = tempVault();
  const note = v.get("vitest");
  assert.ok(note);
  fs.appendFileSync(note.path, "\nchanged\n");
  assert.throws(() => v.deleteNote("vitest", { expectedHash: note.hash }), ConflictError);
  assert.ok(v.get("vitest"));
});

test("approve with a body override writes the edited body and removes the proposal", () => {
  const v = tempVault();
  v.propose("fastapi", techData(), "# Proposed", { proposed_by: "test", reason: "test" });
  v.approve("fastapi", { body: "# Edited" });
  assert.equal(v.get("fastapi")?.body, "# Edited");
  assert.deepEqual(v.listProposals(), []);
});

test("listNotes filters tech notes by layer", () => {
  const v = tempVault();
  const ids = listNotes(v, { type: "tech", layer: "testing" })
    .map((n) => n.id)
    .sort();
  assert.deepEqual(ids, ["playwright", "pytest", "vitest"]);
});

test("listNotes summaries carry tags and a one-line excerpt", () => {
  const v = tempVault();
  const notes = listNotes(v);
  const vitest = notes.find((n) => n.id === "vitest");
  assert.ok(vitest);
  assert.deepEqual(vitest.tags, ["unit", "componentes"]);
  assert.equal(vitest.excerpt, "tests unitarios de TypeScript, React o Node");

  v.writeNote(
    "excerpt-demo",
    { type: "practice", applies_to: [], tags: [], source: "manual" },
    "# Heading\n\nUse [[vitest]] for **unit** tests.\n",
  );
  const practice = listNotes(v).find((n) => n.id === "excerpt-demo");
  assert.equal(practice?.excerpt, "Use vitest for unit tests.");
  for (const note of notes) assert.ok(!note.excerpt || note.excerpt.length <= 120);
});

test("proposalDetail includes the current note and diffable texts without updated", () => {
  const v = tempVault();
  v.propose("fastapi", techData(), "# New FastAPI", { proposed_by: "test", reason: "test" });
  const p = v.getProposal("fastapi");
  assert.ok(p);
  const detail = proposalDetail(v, p);
  assert.ok(detail.current);
  assert.match(detail.proposedText, /# New FastAPI/);
  assert.ok(!detail.proposedText.includes("updated:"));
  assert.ok(!detail.current.text.includes("updated:"));
});
