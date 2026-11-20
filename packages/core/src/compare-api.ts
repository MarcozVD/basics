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
  run: number;
  condition: CompareCondition | LegacyCompareCondition;
  mcp_tool_calls?: McpToolCalls | null;
  acceptance?: AcceptanceResult | null;
  contaminated?: boolean;
  contamination_reasons?: string[];
  shutdown_confirmed?: boolean;
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
      acceptance_passed?: CompareStats | null;
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
