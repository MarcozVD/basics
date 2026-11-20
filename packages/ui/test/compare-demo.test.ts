import type { CompareReport } from "@marcozvd/basics-core";
import { reportConditions } from "@marcozvd/basics-core/compare";
import { describe, expect, it } from "vitest";
import recording from "../../../scripts/demo/compare-recorded.json";
import { sanitizeRecording } from "../../../scripts/demo/compare-recording.mjs";
import { compareCopy } from "../src/lib/compare-copy";
import { compareHistoryMeta, compareSummary } from "../src/lib/compare-summary";

describe("recorded compare data", () => {
  it("keeps recorded metrics and removes local paths and full assistant output", () => {
    expect(recording.recorded).toBe(true);
    expect(recording.results.map((r) => r.wall_ms)).toEqual([181399, 244303]);
    expect(recording.results.map((r) => r.checks_passed)).toEqual([0, 2]);
    expect(JSON.stringify(recording)).not.toMatch(/[A-Za-z]:[\\/]|\/Users\/|\/home\//);
    expect(recording.results.every((r) => r.output.length <= 600 && !("directory" in r))).toBe(true);
    expect("file" in recording).toBe(false);
    const source = { results: [{ output: "x".repeat(1000), directory: "C:/private/run" }], wall_ms: 123, file: "/home/me/report.json" };
    expect(sanitizeRecording(source)).toEqual({ results: [{ output: "x".repeat(600) }], wall_ms: 123, recorded: true });
  });
  it("has matching translations, check states and no em dashes", () => {
    expect(Object.keys(compareCopy.en)).toEqual(Object.keys(compareCopy.es));
    expect(JSON.stringify(compareCopy)).not.toContain("\u2014");
    expect(Object.keys(compareCopy.en.statuses)).toEqual(Object.keys(compareCopy.es.statuses));
  });
  it("summarizes matched layers and approved checks, including spread and absent token reports", () => {
    const report = structuredClone(recording) as unknown as CompareReport;
    report.runs = 2;
    expect(compareSummary(report, "with_basics").layers?.mean).toBe(2);
    expect(compareSummary(report, "without_basics").layers?.mean).toBe(0);
    const first = report.results.find((result) => result.condition === "with_basics")!;
    first.wall_ms = 1000;
    first.tokens = { input: 6, output: 4, total: 10 };
    const second = structuredClone(first);
    second.run = 2;
    second.wall_ms = 3000;
    second.tokens = null;
    second.stack_comparison[0].match = false;
    second.checks[0].status = "untrusted";
    second.checks_passed = 1;
    report.results.push(second);
    const summary = compareSummary(report, "with_basics");
    expect(summary.layers).toEqual({ mean: 1.5, stddev: 0.5 });
    expect(summary.approved).toEqual({ mean: 1.5, stddev: 0.5 });
    expect(summary.wall).toEqual({ mean: 2, stddev: 1 });
    expect(summary.tokens).toEqual({ mean: 10, stddev: 0 });
  });
  it("omits null, empty and whitespace-only models from history metadata", () => {
    for (const model of [null, "", "  "]) expect(compareHistoryMeta("claude", model, "today")).toBe("claude · today");
    expect(compareHistoryMeta("claude", "haiku", "today")).toBe("claude · haiku · today");
  });
  it("keeps legacy demo metrics, shows available conditions only and excludes contaminated runs", () => {
    const report = structuredClone(recording) as unknown as CompareReport;
    expect(reportConditions(report)).toEqual(["none", "basics"]);
    expect(compareSummary(report, "basics").mcp).toBeNull();
    expect(compareSummary(report, "basics").acceptance).toBeNull();
    report.results[1].contaminated = true;
    expect(compareSummary(report, "basics").layers).toBeNull();
  });
});
