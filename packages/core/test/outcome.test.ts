import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { type NoteData, NotFoundError, recordOutcome, Vault } from "../src/index.js";

function tempVault(): Vault {
  const vault = Vault.load(fs.mkdtempSync(path.join(os.tmpdir(), "basics-outcome-")));
  vault.writeNote(
    "project",
    {
      type: "project",
      title: "Demo",
      status: "active",
      path: "/tmp/demo",
      stack: { backend: ["fastapi"] },
      lessons: ["Existing"],
      tags: [],
      source: "manual",
    },
    "# Demo",
  );
  vault.writeNote(
    "fastapi",
    {
      type: "tech",
      kind: "framework",
      layer: "backend",
      use_when: ["Existing"],
      avoid_when: [],
      performs_best: [],
      tags: [],
      source: "manual",
    },
    "# FastAPI\n\n## Lessons\n\n- Old lesson",
  );
  return vault;
}

test("recordOutcome proposes project lessons, reason and a dated outcome section", () => {
  const vault = tempVault();
  const ids = recordOutcome(vault, { project: "project", summary: "Shipped the API", lessons: [" Existing ", "New", "New"] }, "agent-x");

  assert.deepEqual(ids, ["project"]);
  const proposal = vault.getProposal("project");
  assert.ok(proposal);
  assert.equal(proposal.meta.proposed_by, "agent-x");
  assert.equal(proposal.meta.reason, "Outcome of project: Shipped the API");
  const data = proposal.data as Extract<NoteData, { type: "project" }>;
  assert.deepEqual(data.lessons, ["Existing", "New"]);
  assert.equal(data.reason, "Shipped the API");
  assert.match(proposal.body, /## Outcome \d{4}-\d{2}-\d{2}\n\nShipped the API/);
});

test("recordOutcome appends tech items case-insensitively and keeps existing values", () => {
  const vault = tempVault();
  recordOutcome(
    vault,
    {
      project: "project",
      summary: "Used dependency injection",
      tech_updates: [
        {
          id: "fastapi",
          add_use_when: ["existing", " NEW "],
          add_avoid_when: ["Avoid blocking calls"],
          add_performs_best: ["Typed request models"],
          lesson: "Prefer Depends over globals.",
        },
      ],
    },
    "agent-x",
  );

  const proposal = vault.getProposal("fastapi");
  assert.ok(proposal);
  const data = proposal.data as Extract<NoteData, { type: "tech" }>;
  assert.deepEqual(data.use_when, ["Existing", "NEW"]);
  assert.deepEqual(data.avoid_when, ["Avoid blocking calls"]);
  assert.deepEqual(data.performs_best, ["Typed request models"]);
  assert.match(proposal.body, /## Lessons\n\n- Old lesson\n- Prefer Depends over globals\./);
});

test("recordOutcome creates a Lessons section when the tech has none", () => {
  const vault = tempVault();
  vault.writeNote("react", { type: "tech", kind: "library", layer: "frontend", tags: [], source: "manual" }, "# React");

  recordOutcome(
    vault,
    { project: "project", summary: "UI work", tech_updates: [{ id: "react", lesson: "Memoize expensive lists." }] },
    "agent-x",
  );

  assert.match(vault.getProposal("react")?.body ?? "", /## Lessons\n\n- Memoize expensive lists\./);
});

test("recordOutcome merges into an existing proposal instead of replacing it", () => {
  const vault = tempVault();
  recordOutcome(
    vault,
    {
      project: "project",
      summary: "First pass",
      lessons: ["One"],
      tech_updates: [{ id: "fastapi", add_use_when: ["First"], lesson: "First lesson" }],
    },
    "agent-x",
  );
  recordOutcome(
    vault,
    {
      project: "project",
      summary: "Second pass",
      lessons: ["Two"],
      tech_updates: [{ id: "fastapi", add_use_when: ["Second"], lesson: "Second lesson" }],
    },
    "agent-x",
  );

  assert.equal(vault.listProposals().length, 2);
  const project = vault.getProposal("project");
  assert.ok(project);
  const projectData = project.data as Extract<NoteData, { type: "project" }>;
  assert.deepEqual(projectData.lessons, ["Existing", "One", "Two"]);
  assert.equal((project.body.match(/## Outcome/g) ?? []).length, 2);
  assert.match(project.body, /First pass[\s\S]*Second pass/);

  const tech = vault.getProposal("fastapi");
  assert.ok(tech);
  const data = tech.data as Extract<NoteData, { type: "tech" }>;
  assert.deepEqual(data.use_when, ["Existing", "First", "Second"]);
  assert.match(tech.body, /First lesson\n- Second lesson/);
});

test("recordOutcome errors on unknown or wrong note types", () => {
  const vault = tempVault();
  assert.throws(() => recordOutcome(vault, { project: "missing", summary: "x" }, "agent-x"), NotFoundError);
  assert.throws(() => recordOutcome(vault, { project: "fastapi", summary: "x" }, "agent-x"), NotFoundError);
  assert.throws(
    () => recordOutcome(vault, { project: "project", summary: "x", tech_updates: [{ id: "missing" }] }, "agent-x"),
    NotFoundError,
  );
  assert.throws(
    () => recordOutcome(vault, { project: "project", summary: "x", tech_updates: [{ id: "project" }] }, "agent-x"),
    /not a tech note/,
  );
});
