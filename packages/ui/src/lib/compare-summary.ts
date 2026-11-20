import type { CompareCondition, CompareReport } from "@marcozvd/basics-core";

function stats(values: number[]) {
  if (!values.length) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { mean, stddev: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length) };
}

export function compareSummary(report: CompareReport, condition: CompareCondition) {
  const runs = report.results.filter((result) => result.condition === condition);
  return {
    layers: stats(runs.map((run) => run.stack_comparison.filter((layer) => layer.match).length)),
    layerTotal: stats(runs.map((run) => run.stack_comparison.length)),
    checks: stats(runs.map((run) => run.checks_passed)),
    approved: stats(runs.map((run) => run.checks.filter((check) => check.command && check.status !== "untrusted").length)),
    untrusted: stats(runs.map((run) => run.checks.filter((check) => check.status === "untrusted").length)),
    wall: stats(runs.map((run) => run.wall_ms / 1000)),
    tokens: stats(runs.flatMap((run) => (run.tokens ? [run.tokens.total] : []))),
  };
}

export function compareHistoryMeta(agent: string, model: string | null, date: string) {
  return [agent, model?.trim(), date].filter(Boolean).join(" · ");
}
