import type { AgentId } from "./api.js";

export type CompareCondition = "without_basics" | "with_basics";
export type CompareCheckStatus = "pass" | "fail" | "skip" | "timeout" | "missing_tool" | "untrusted";
export interface CompareRequest {
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
  condition: CompareCondition;
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
