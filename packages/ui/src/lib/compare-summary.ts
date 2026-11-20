import {
  type CompareCondition,
  type CompareReport,
  type LegacyCompareCondition,
  normalizeCompareCondition,
} from "@marcozvd/basics-core/compare";

function stats(values: number[]) {
  if (!values.length) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { mean, stddev: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) };
}

export function compareSummary(report: CompareReport, condition: CompareCondition | LegacyCompareCondition) {
  const runs = report.results.filter(
    (result) => normalizeCompareCondition(result.condition) === normalizeCompareCondition(condition) && !result.contaminated,
  );
  return {
    layers: stats(runs.map((run) => run.stack_comparison.filter((layer) => layer.match).length)),
    layerTotal: stats(runs.map((run) => run.stack_comparison.length)),
    checks: stats(runs.map((run) => run.checks_passed)),
    approved: stats(runs.map((run) => run.checks.filter((check) => check.command && check.status !== "untrusted").length)),
    untrusted: stats(runs.map((run) => run.checks.filter((check) => check.status === "untrusted").length)),
    wall: stats(runs.map((run) => run.wall_ms / 1000)),
    tokens: stats(runs.flatMap((run) => (run.tokens ? [run.tokens.total] : []))),
    mcp: stats(runs.flatMap((run) => (run.mcp_tool_calls ? [run.mcp_tool_calls.total] : []))),
    acceptance: stats(
      runs.flatMap((run) =>
        run.acceptance && run.acceptance.status !== "error" && run.acceptance.passed !== null ? [run.acceptance.passed] : [],
      ),
    ),
  };
}

export function compareHistoryMeta(agent: string, model: string | null, date: string) {
  return [agent, model?.trim(), date].filter(Boolean).join(" · ");
}
