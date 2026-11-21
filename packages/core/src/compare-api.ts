import type { AgentId } from "./api.js";

export const COMPARE_CONDITIONS = ["none", "agents-md", "basics"] as const;
export type CompareCondition = (typeof COMPARE_CONDITIONS)[number];
export type LegacyCompareCondition = "without_basics" | "with_basics";
export function normalizeCompareCondition(condition: CompareCondition | LegacyCompareCondition): CompareCondition {
  return condition === "without_basics" ? "none" : condition === "with_basics" ? "basics" : condition;
}
export function reportConditions(report: Pick<CompareReport, "conditions" | "results">): CompareCondition[] {
  return [...new Set((report.conditions ?? report.results.map((r) => r.condition)).map(normalizeCompareCondition))];
}
export interface McpToolCalls {
  total: number;
  by_tool: Record<string, number>;
}
export interface ShutdownDiagnostics {
  reason: string;
  signal_error?: string;
  snapshot_error?: string;
  processes: { pid: number; pgid?: number; state: string }[];
}
export interface AcceptanceSpec {
  /** Runner-owned JSON bundle: {files: {relativePath: UTF8Content}}. Never sent to agents. */
  bundle: string;
  command: string;
}
export interface AcceptanceResult {
  status: "pass" | "fail" | "error";
  passed: number | null;
  failed: number | null;
  reason?: string;
  duration_ms: number;
  pass_rate?: number | null;
  all_passed?: boolean | null;
}
/** Counts are authoritative, including for history written before derived metrics existed. */
export function acceptanceMetrics(result: AcceptanceResult | null | undefined): { pass_rate: number | null; all_passed: boolean | null } {
  const passed = result?.passed,
    failed = result?.failed;
  if (
    !result ||
    result.status === "error" ||
    passed == null ||
    failed == null ||
    !Number.isSafeInteger(passed) ||
    !Number.isSafeInteger(failed) ||
    passed < 0 ||
    failed < 0 ||
    passed + failed === 0
  )
    return { pass_rate: null, all_passed: null };
  return { pass_rate: passed / (passed + failed), all_passed: failed === 0 };
}
export function summarizeAcceptance(results: Pick<CompareResult, "acceptance" | "contaminated">[]) {
  const measured = results
    .filter((result) => !result.contaminated)
    .map((result) => acceptanceMetrics(result.acceptance))
    .filter((value) => value.pass_rate !== null);
  const stats = (values: number[]): CompareStats | null => {
    if (!values.length) return null;
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    return {
      count: values.length,
      mean,
      stddev: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length),
      min: Math.min(...values),
      max: Math.max(...values),
    };
  };
  return {
    acceptance_passed: stats(measured.map((value) => value.pass_rate!)),
    acceptance_all_passed: stats(measured.map((value) => (value.all_passed ? 1 : 0))),
  };
}
export type CompareCheckStatus = "pass" | "fail" | "skip" | "timeout" | "missing_tool" | "untrusted";
export interface CompareRequest {
  conditions?: CompareCondition[];
  acceptance?: AcceptanceSpec;
  studyDir?: string;
  task?: string;
  sample?: string;
  agent: AgentId;
  model?: string;
  runs: number;
  timeoutMs: number;
  language?: string;
}
export interface ComparePlan {
  id: string;
  task: string;
  run_count: number;
  checks: { id: string; command: string }[];
}
export interface CompareStats {
  count: number;
  mean: number;
  stddev: number;
  min: number;
  max: number;
}
export interface CompareResult {
  resolved_model?: string;
  reported_models?: string[];
  run: number;
  condition: CompareCondition | LegacyCompareCondition;
  mcp_tool_calls?: McpToolCalls | null;
  acceptance?: AcceptanceResult | null;
  contaminated?: boolean;
  contamination_reasons?: string[];
  shutdown_confirmed?: boolean;
  shutdown_diagnostics?: ShutdownDiagnostics;
  ok: boolean;
  error?: string;
  timed_out: boolean;
  wall_ms: number;
  tokens: { input: number; output: number; total: number; cache_read?: number; cache_creation?: number } | null;
  stack_used: Record<string, string[]>;
  stack_comparison: { layer: string; expected: string[]; used: string[]; match: boolean }[];
  stack_match: number | null;
  checks: { id: string; command?: string; status: CompareCheckStatus; duration_ms: number; output_tail?: string; hint?: string }[];
  checks_passed: number;
  files: { added: string[]; changed: string[]; deleted: string[]; excluded: string[]; truncated: boolean } | null;
  output: string;
  cleanup_errors: string[];
}
export interface CompareReport {
  conditions?: CompareCondition[];
  /** Event-based detection is incomplete; no enforced filesystem isolation. */
  validity_note?: string;
  schema_version: number;
  id: string;
  at: string;
  task: string;
  sample?: string;
  agent: AgentId;
  model: string | null;
  runs: number;
  timeout_ms: number;
  trust_checks?: boolean;
  recorded?: boolean;
  cancelled?: boolean;
  recommendation: Record<string, string[]>;
  results: CompareResult[];
  summary: Record<
    string,
    {
      runs: number;
      successes: number;
      wall_ms: CompareStats | null;
      tokens_total: CompareStats | null;
      checks_passed: CompareStats | null;
      stack_match: CompareStats | null;
      files_added: CompareStats | null;
      files_changed: CompareStats | null;
      files_deleted: CompareStats | null;
      mcp_tool_calls?: CompareStats | null;
      /** Per-run passed/(passed+failed); mean is unweighted across measured, uncontaminated runs. */
      acceptance_passed?: CompareStats | null;
      /** Per-run 0/1 all-passed flag; mean is the share of measured runs fully passing. */
      acceptance_all_passed?: CompareStats | null;
      contaminated_runs?: number;
    }
  >;
}
export interface CompareProgress {
  phase: "planned" | "running" | "checks" | "condition-finished" | "finished" | "cancelled" | "error";
  run?: number;
  condition?: CompareCondition;
  check?: string;
  status?: CompareCheckStatus;
}
export interface CompareState {
  id: string;
  active: boolean;
  progress: CompareProgress;
  report?: CompareReport;
  error?: string;
}
