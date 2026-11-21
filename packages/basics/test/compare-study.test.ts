import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { analyze, loadRecords } from "../../../scripts/study/analyze.mjs";
import { buildBundles } from "../../../scripts/study/build-bundles.mjs";
import { buildStudyVault } from "../../../scripts/study/build-vault.mjs";
import { append, readJson, studyRoot } from "../../../scripts/study/common.mjs";
import { readContract, resolveCommand } from "../../../scripts/study/contract.mjs";
import { createStudy, estimatedCost, matrix, microUsd, reconcile, runStudy } from "../../../scripts/study/run.mjs";
import { loadTasks, taskPrompt } from "../../../scripts/study/spec.mjs";
import { bootstrapMean, holm, wilcoxon } from "../../../scripts/study/stats.mjs";
import { validatePilots } from "../../../scripts/study/validate.mjs";
import { CompareDirectories } from "../src/compare-files.js";

function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "basics-study-test-")),
    owner = new CompareDirectories();
  owner.own(base);
  const agent = (model: string) => ({
    model,
    cli: { command: process.execPath, prefix: [] },
    version: "fake-1",
    prices: { input: 1, output: 1, cache_read: 1, cache_creation: 1 },
    cache: "reported",
  });
  const config = {
    seed: "pilot-test",
    repeats: 2,
    timeout_ms: 1000,
    budget_usd: 1,
    reservation_usd: 0.00001,
    rates_at: "2026-11-20T00:00:00.000Z",
    toolchains: { node: { command: process.execPath, prefix: [] } },
    agents: { claude: agent("claude-haiku-fixture-20261120"), opencode: agent("tokenharbor1/deepseek-v4.1-flash-1017") },
  };
  const preflight = () => ({
    fake: true,
    agents: { claude: { version: "fake-1" }, opencode: { version: "fake-1" } },
    toolchains: { node: process.version },
  });
  const output = path.join(base, "study");
  return { base, output, config, preflight, cleanup: () => owner.remove(base) };
}
function fakeResult(lock: ReturnType<typeof createStudy>, cell: ReturnType<typeof matrix>[number]) {
  return {
    run: 1,
    condition: cell.condition,
    resolved_model: lock.config.agents[cell.agent].model,
    ok: true,
    timed_out: false,
    wall_ms: 2,
    shutdown_confirmed: true,
    contaminated: false,
    acceptance: { status: "pass", passed: 2, failed: 0, duration_ms: 1 },
    tokens: { input: 2, output: 2, total: 4, cache_read: 0, cache_creation: 0 },
    mcp_tool_calls: cell.condition === "basics" ? { total: 1, by_tool: { get_note: 1 } } : null,
    stack_match: 1,
    checks: [{ command: "node test", status: "pass" }],
    checks_passed: 1,
  };
}

test("task specs are language-neutral and contracts reject shells, invalid fields and escaping executables", () => {
  const f = fixture();
  try {
    const tasks = loadTasks();
    assert.equal(tasks.length, 3);
    for (const task of tasks) {
      assert.match(taskPrompt(task), /Node\/TypeScript, Python or Rust/);
      assert.ok(!taskPrompt(task).includes(".basics-acceptance"));
    }
    fs.writeFileSync(path.join(f.base, "study-run.json"), JSON.stringify({ interface: "cli", command: ["node", "main.mjs"] }));
    assert.equal(readContract(f.base).interface, "cli");
    fs.writeFileSync(path.join(f.base, "study-run.json"), JSON.stringify({ interface: "cli", command: "node main.mjs" }));
    assert.throws(() => readContract(f.base), /argv/);
    assert.throws(() => resolveCommand(["cmd.exe", "/c", "echo bad"], f.base, {}), /Unsupported/);
    assert.throws(() => resolveCommand(["../outside"], f.base, {}), /Unsupported/);
    assert.deepEqual(resolveCommand(["node", "-e", "literal $(not shell)"], f.base, {}), {
      command: process.execPath,
      args: ["-e", "literal $(not shell)"],
    });
  } finally {
    f.cleanup();
  }
});

test("vault and acceptance bundles build deterministically without references or extracted tests", () => {
  const f = fixture();
  try {
    const a = buildStudyVault(path.join(f.base, "a")),
      b = buildStudyVault(path.join(f.base, "b"));
    assert.equal(a.hash, b.hash);
    assert.equal(a.packs.length, 11);
    assert.ok(a.notes > 100);
    assert.ok(a.collisions.length > 0);
    const one = buildBundles(path.join(f.base, "one")),
      two = buildBundles(path.join(f.base, "two"));
    assert.deepEqual(
      one.map((bundle) => bundle.hash),
      two.map((bundle) => bundle.hash),
    );
    for (const bundle of one) {
      const data = readJson(bundle.bundle);
      assert.ok(data.files["run.mjs"]);
      assert.ok(data.files["agent-process-tree.js"]);
      assert.ok(!Object.keys(data.files).some((name) => name.includes("reference") || name.includes("mutation")));
    }
    assert.equal(fs.existsSync(path.join(f.base, ".basics-acceptance")), false);
  } finally {
    f.cleanup();
  }
}, 30000);

test("statistic fixtures match hand-checkable exact sign permutations, ties, zeros, Holm and degenerate bootstrap", () => {
  const fixtures = readJson(path.join(studyRoot, "stat-fixtures.json"));
  for (const expected of fixtures.wilcoxon) {
    const actual = wilcoxon(expected.differences);
    for (const key of ["statistic", "pvalue", "nonzero"]) assert.equal(actual[key], expected[key]);
  }
  assert.deepEqual(holm(fixtures.holm.input), fixtures.holm.expected);
  const result = bootstrapMean(fixtures.bootstrap.differences, { seed: "fixed" });
  assert.equal(result.mean, 0.5);
  assert.equal(result.low, 0.5);
  assert.equal(result.high, 0.5);
  assert.deepEqual(
    bootstrapMean([1, 2, 3], { seed: "fixed", resamples: 500 }),
    bootstrapMean([1, 2, 3], { seed: "fixed", resamples: 500 }),
  );
  assert.throws(() => wilcoxon([NaN]), /finite/);
});

test("fake batch is sequential, resumable, journaled and rejects lock, bundle or metadata changes", async () => {
  const f = fixture();
  try {
    const lock = createStudy(f.config, f.output, { preflight: f.preflight });
    assert.equal(lock.cells.length, 36);
    assert.deepEqual(matrix(lock.tasks, lock.config), lock.cells);
    await assert.rejects(runStudy(f.output, { preflight: f.preflight }), /approval/);
    let calls = 0,
      active = 0,
      maxActive = 0;
    const executeCell = async (locked, cell) => {
      calls++;
      active++;
      maxActive = Math.max(active, maxActive);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active--;
      return fakeResult(locked, cell);
    };
    assert.equal(
      (await runStudy(f.output, { execute: true, approveChecks: true, preflight: f.preflight, executeCell })).status,
      "completed",
    );
    assert.equal(maxActive, 1);
    assert.equal(calls, 36);
    assert.equal(
      (await runStudy(f.output, { execute: true, approveChecks: true, preflight: f.preflight, executeCell })).status,
      "completed",
    );
    assert.equal(calls, 36);
    const records = loadRecords(f.output, lock);
    assert.equal(records.length, 36);
    assert.ok(records.every((row) => row.cli_version === "fake-1" && row.reported_model === lock.config.agents[row.cell.agent].model));
    const analysis = analyze(lock, records, { resamples: 100 });
    assert.equal(analysis.primary_family, 12);
    assert.equal(analysis.comparisons.filter((row) => row.primary).length, 12);
    await assert.rejects(
      runStudy(f.output, { execute: true, approveChecks: true, preflight: () => ({ ...f.preflight(), changed: true }), executeCell }),
      /metadata/,
    );
    fs.appendFileSync(path.join(f.output, "bundles", `${lock.tasks[0].id}.json`), " ");
    await assert.rejects(runStudy(f.output, { execute: true, approveChecks: true, preflight: f.preflight, executeCell }), /bundle changed/);
  } finally {
    f.cleanup();
  }
}, 30000);

test("budget reservations stop scheduling; unknown usage is retained until explicit reconciliation", async () => {
  const f = fixture();
  try {
    const lock = createStudy({ ...f.config, budget_usd: 0.000025 }, f.output, { preflight: f.preflight });
    let calls = 0;
    const executeCell = async (locked, cell) => {
      calls++;
      return fakeResult(locked, cell);
    };
    const result = await runStudy(f.output, { execute: true, approveChecks: true, preflight: f.preflight, executeCell });
    assert.equal(result.status, "budget-exhausted");
    assert.equal(calls, 4);
    assert.equal(result.charged_micro_usd, 16);
    assert.equal(loadRecords(f.output, lock).length, 4);
    assert.equal(estimatedCost(null, f.config.agents.claude), null);
    assert.equal(microUsd(0.25), 250000);
  } finally {
    f.cleanup();
  }
  const unknown = fixture();
  try {
    const lock = createStudy(unknown.config, unknown.output, { preflight: unknown.preflight });
    const result = await runStudy(unknown.output, {
      execute: true,
      approveChecks: true,
      preflight: unknown.preflight,
      executeCell: async (locked, cell) => ({ ...fakeResult(locked, cell), tokens: null }),
    });
    assert.equal(result.status, "unknown-cost");
    assert.equal(
      (
        await runStudy(unknown.output, {
          execute: true,
          approveChecks: true,
          preflight: unknown.preflight,
          executeCell: () => assert.fail("must not launch"),
        })
      ).status,
      "reconciliation-required",
    );
    reconcile(unknown.output, lock.cells[0].id, 0.00002);
    assert.equal(loadRecords(unknown.output, lock)[0].status, "reconciled");
    assert.ok(loadRecords(unknown.output, lock)[0].result.acceptance);
  } finally {
    unknown.cleanup();
  }
}, 30000);

test("crash reservations, duplicate terminals and active runner locks cannot silently rerun sessions", async () => {
  const f = fixture();
  try {
    const lock = createStudy(f.config, f.output, { preflight: f.preflight }),
      cell = lock.cells[0],
      file = path.join(f.output, "runs", `${cell.id}.jsonl`);
    append(file, { event: "started", id: cell.id, cell, lock_hash: lock.hash, reserved_micro_usd: 10 });
    await assert.rejects(
      runStudy(f.output, { execute: true, approveChecks: true, preflight: f.preflight, executeCell: () => assert.fail("must not retry") }),
      /Unresolved/,
    );
    reconcile(f.output, cell.id, 0.00001);
    assert.equal(loadRecords(f.output, lock)[0].status, "abandoned");
    fs.writeFileSync(path.join(f.output, ".runner.lock"), JSON.stringify({ pid: process.pid }));
    await assert.rejects(runStudy(f.output, { execute: true, approveChecks: true, preflight: f.preflight }), /Another runner/);
    fs.unlinkSync(path.join(f.output, ".runner.lock"));
    append(file, { event: "finished", id: cell.id, cell, lock_hash: lock.hash, charged_micro_usd: 0 });
    assert.throws(() => loadRecords(f.output, lock), /Duplicate terminal/);
  } finally {
    f.cleanup();
  }
}, 30000);

test("analysis pairs task means over repeats, excludes contamination and keeps all 12 primary hypotheses", () => {
  const f = fixture();
  const tasks = loadTasks(),
    lock = { hash: "fixture", config: { ...f.config }, tasks, cells: matrix(tasks, f.config) };
  try {
    const records = lock.cells.map((cell) => {
      const result = fakeResult(lock, cell);
      result.acceptance =
        cell.condition === "basics"
          ? { status: "pass", passed: 100, failed: 0, duration_ms: 1 }
          : { status: "fail", passed: 3, failed: 1, duration_ms: 1 };
      if (cell.task === tasks[0].id && cell.condition === "basics" && cell.repeat === 1) result.contaminated = true;
      return { id: cell.id, cell, lock_hash: lock.hash, result, charged_micro_usd: 1 };
    });
    const result = analyze(lock, records, { resamples: 100 });
    const contrast = result.comparisons.find(
      (row) => row.agent === "claude" && row.baseline === "agents-md" && row.metric === "acceptance_pass_rate",
    );
    assert.equal(contrast.tasks, 2);
    assert.equal(contrast.effect.mean, 0.25);
    const group = result.groups.find((row) => row.agent === "claude" && row.condition === "basics");
    assert.equal(group.contaminated, 1);
    assert.equal(group.metrics.acceptance_pass_rate.mean, 1);
    assert.equal(result.comparisons.filter((row) => row.primary).length, 12);
    assert.throws(() => analyze(lock, [records[0], records[0]]), /locked/);
    assert.throws(() => analyze(lock, [{ ...records[0], lock_hash: "wrong" }]), /locked/);
  } finally {
    f.cleanup();
  }
});

test("all three hidden harnesses accept references and reject two targeted mutations each", async () => {
  const results = await validatePilots();
  assert.equal(results.length, 9);
  assert.equal(results.filter((row) => row.variant === "reference" && row.status === "pass").length, 3);
  assert.equal(results.filter((row) => row.variant !== "reference" && row.status === "fail").length, 6);
}, 180000);
