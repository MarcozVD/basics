import assert from "node:assert/strict";
import { test } from "vitest";
import { type AcceptanceResult, acceptanceMetrics, summarizeAcceptance } from "../src/compare-api.js";

test("acceptance uses test pass fractions and separate fully-passing flags", () => {
  const partial: AcceptanceResult = { status: "fail", passed: 3, failed: 1, duration_ms: 0 };
  const full: AcceptanceResult = { status: "pass", passed: 100, failed: 0, duration_ms: 0 };
  assert.deepEqual(acceptanceMetrics(partial), { pass_rate: 0.75, all_passed: false });
  assert.deepEqual(acceptanceMetrics(full), { pass_rate: 1, all_passed: true });
  assert.deepEqual(acceptanceMetrics({ ...partial, passed: 0, failed: 4 }), { pass_rate: 0, all_passed: false });
  const summary = summarizeAcceptance([{ acceptance: partial }, { acceptance: full }]);
  assert.deepEqual(summary.acceptance_passed, { count: 2, mean: 0.875, stddev: 0.125, min: 0.75, max: 1 });
  assert.deepEqual(summary.acceptance_all_passed, { count: 2, mean: 0.5, stddev: 0.5, min: 0, max: 1 });
});

test("unmeasured, zero-test and contaminated acceptance results do not enter either denominator", () => {
  const result: AcceptanceResult = { status: "pass", passed: 2, failed: 0, duration_ms: 0 };
  for (const acceptance of [
    null,
    undefined,
    { ...result, passed: 0 },
    { ...result, status: "error" as const },
    { ...result, failed: null },
    { ...result, passed: -1 },
  ])
    assert.deepEqual(acceptanceMetrics(acceptance), { pass_rate: null, all_passed: null });
  assert.deepEqual(summarizeAcceptance([{ acceptance: result, contaminated: true }, { acceptance: null }]), {
    acceptance_passed: null,
    acceptance_all_passed: null,
  });
  // Recompute older/stale derived fields from their authoritative counts.
  assert.deepEqual(acceptanceMetrics({ ...result, pass_rate: 0, all_passed: false }), { pass_rate: 1, all_passed: true });
});
