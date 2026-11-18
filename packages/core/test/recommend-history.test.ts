import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import {
  type Embedder,
  loadIndex,
  loadVaultConfig,
  projectHistory,
  projectSchema,
  recommend,
  recommendHybrid,
  recordOutcome,
  saveHistoryConfig,
  syncIndex,
  Vault,
} from "../src/index.js";

const FIXTURE = path.join(import.meta.dirname, "fixtures/history-vault");
function cap(vault: Vault, weight = 1) {
  const candidates = recommend(vault, "service").layers.backend;
  return Math.round(Math.max(...candidates.map((c) => c.score - (c.score_breakdown.history ?? 0))) * 0.1 * weight);
}
test("old project notes and outcome calls remain valid without an explicit result", () =>
  run((vault) => {
    const old = projectSchema.parse({ type: "project", status: "done", stack: { backend: ["beta"] } });
    assert.equal(old.outcome, undefined);
    recordOutcome(vault, { project: "shipped", summary: "Legacy client summary" }, "old-client");
    const proposal = vault.getProposal("shipped");
    assert.ok(proposal?.data.type === "project");
    assert.equal(proposal.data.outcome, undefined);
    assert.equal(projectHistory(vault).get("beta")?.[0].outcome, "successful");
  }));

test("unfinished projects, prose and pending project proposals never invent successful evidence", () =>
  run((vault) => {
    for (const note of vault.byType("project")) {
      if (note.data.type !== "project") continue;
      vault.writeNote(
        note.id,
        { ...note.data, status: "active", outcome: undefined },
        "Successful project, according to unstructured prose.",
      );
    }
    const reloaded = Vault.load(vault.root);
    reloaded.propose("pending", projectSchema.parse({ type: "project", status: "done", stack: { backend: ["beta"] } }), "Not approved", {
      proposed_by: "test",
      reason: "Pending only",
    });
    assert.equal(projectHistory(reloaded).size, 0);
    assert.ok(
      recommend(reloaded, "service").layers.backend.every((c) => c.score_breakdown.history === 0 && c.history_projects?.length === 0),
    );
  }));
function run(fn: (vault: Vault) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-history-"));
  fs.cpSync(FIXTURE, root, { recursive: true });
  try {
    fn(Vault.load(root));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("hybrid keeps project evidence, respects off switch and explicit tool/language constraints", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-history-hybrid-"));
  fs.cpSync(FIXTURE, root, { recursive: true });
  try {
    const vault = Vault.load(root);
    const embedder: Embedder = {
      model: "history-test",
      dim: 2,
      async embed(texts) {
        return texts.map(() => new Float32Array([1, 0]));
      },
    };
    await syncIndex(vault, embedder);
    const index = loadIndex(vault);
    const result = await recommendHybrid(vault, "service", index, embedder);
    assert.equal(result.layers.backend[0].id, "beta");
    assert.equal(result.layers.backend[0].history_projects?.[0].id, "shipped");
    for (const query of ["Alpha service", "servicio con Alpha"]) {
      const named = await recommendHybrid(vault, query, index, embedder);
      assert.equal(named.layers.backend[0].id, "alpha");
      assert.ok(named.layers.backend.every((c) => c.score_breakdown.history === 0));
    }
    for (const query of ["service in Rust", "service en Rust"]) {
      const constrained = await recommendHybrid(vault, query, index, embedder);
      assert.equal(constrained.layers.backend[0].id, "gamma");
      assert.ok(constrained.layers.backend.every((c) => c.id !== "alpha" && c.id !== "beta"));
    }
    saveHistoryConfig(root, { enabled: false });
    const off = await recommendHybrid(vault, "service", index, embedder);
    assert.equal(off.layers.backend[0].id, "alpha");
    assert.ok(off.layers.backend.every((c) => c.score_breakdown.history === 0));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("accepted project results boost, penalize and explain only real stack members", () =>
  run((vault) => {
    const candidates = recommend(vault, "service").layers.backend;
    assert.equal(candidates[0].id, "beta");
    for (const c of candidates) {
      assert.equal(c.score_breakdown.history, c.id === "beta" ? cap(vault) : -cap(vault));
      assert.equal(c.history_projects?.length, 1);
      assert.ok(vault.get(c.history_projects![0].id)?.data.type === "project");
      assert.equal(
        c.score,
        Object.values(c.score_breakdown).reduce((a, b) => a + b, 0),
      );
    }
  }));

test("default proportional history crosses a real score gap without keyword-only history recommendations", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-history-realistic-"));
  fs.cpSync(path.resolve(import.meta.dirname, "../../../examples/vault"), root, { recursive: true });
  try {
    const vault = Vault.load(root);
    vault.writeNote(
      "web-success",
      projectSchema.parse({ type: "project", outcome: "successful", stack: { frontend: ["nextjs", "react"] } }),
      "Accepted outcome",
    );
    saveHistoryConfig(root, { weight: 0 });
    const before = recommend(vault, "invoicing web app").layers.backend;
    assert.equal(before[0].id, "fastapi");
    const next = before.find((c) => c.id === "nextjs")!;
    assert.ok(before[0].score > next.score, "not an exact tie");
    saveHistoryConfig(root, { weight: 1 });
    const after = recommend(vault, "invoicing web app").layers.backend;
    assert.equal(after[0].id, "nextjs");
    assert.equal(after[0].score_breakdown.history, Math.round(before[0].score * 0.1));
    saveHistoryConfig(root, { weight: 3 });
    const max = recommend(vault, "invoicing web app").layers.backend;
    assert.equal(max[0].score_breakdown.history, Math.round(before[0].score * 0.3));
    assert.equal(recommend(vault, "unrelatedword").layers.backend.length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("vault-local off switch, zero weight and bounded custom weight preserve deterministic ties", () =>
  run((vault) => {
    saveHistoryConfig(vault.root, { enabled: false });
    const off = recommend(vault, "service").layers.backend;
    assert.deepEqual(
      off.map((c) => c.id),
      ["alpha", "beta", "gamma"],
    );
    assert.ok(off.every((c) => c.score_breakdown.history === 0 && c.history_projects?.length === 0));
    assert.deepEqual(loadVaultConfig(vault.root).history, { enabled: false, weight: 1 });
    saveHistoryConfig(vault.root, { enabled: true, weight: 0 });
    assert.deepEqual(recommend(vault, "service").layers.backend, off);
    saveHistoryConfig(vault.root, { weight: 0.5 });
    assert.equal(recommend(vault, "service").layers.backend[0].score_breakdown.history, cap(vault, 0.5));
    assert.throws(() => saveHistoryConfig(vault.root, { weight: 4 }));
  }));
test("opposing projects cancel and repeated or duplicate stack references cannot amplify the cap", () =>
  run((vault) => {
    const note = vault.get("shipped")!;
    assert.equal(note.data.type, "project");
    vault.writeNote("second", { ...note.data, type: "project", stack: { backend: ["beta", "beta"], extra: ["beta", "unknown"] } }, "");
    assert.equal(recommend(vault, "service").layers.backend[0].score_breakdown.history, cap(vault));
    assert.equal(projectHistory(vault).get("beta")?.length, 2);
    vault.writeNote("second", { ...note.data, type: "project", outcome: "failed", stack: { backend: ["beta"] } }, "");
    assert.equal(recommend(vault, "service").layers.backend.find((c) => c.id === "beta")?.score_breakdown.history, 0);
  }));
test("pending recorded outcomes do not count until approved, and latest explicit outcome takes priority over done", () =>
  run((vault) => {
    recordOutcome(vault, { project: "shipped", summary: "Deployment failed", outcome: "failed" }, "test-agent");
    assert.equal(projectHistory(vault).get("beta")?.[0].outcome, "successful");
    vault.approve("shipped");
    assert.equal(projectHistory(vault).get("beta")?.[0].outcome, "failed");
    assert.equal(recommend(vault, "service").layers.backend.find((c) => c.id === "beta")?.score_breakdown.history, -cap(vault));
  }));
test("history cannot override explicit tools or requested languages in English or Spanish", () =>
  run((vault) => {
    saveHistoryConfig(vault.root, { weight: 3 });
    for (const query of ["Alpha service", "servicio con Alpha"]) {
      const result = recommend(vault, query).layers.backend;
      assert.equal(result[0].id, "alpha");
      assert.ok(result.every((c) => c.score_breakdown.history === 0));
    }
    for (const query of ["service in Rust", "servicio en Rust"]) {
      const result = recommend(vault, query).layers.backend;
      assert.ok(result.length > 0);
      assert.ok(
        result.some((c) => c.id === "gamma"),
        JSON.stringify({ query, result }),
      );
      assert.ok(
        result.every((c) => c.id !== "alpha" && c.id !== "beta"),
        JSON.stringify({ query, result }),
      );
    }
    assert.equal(recommend(vault, "unrelatedword").layers.backend.length, 0);
  }));
