import type { CheckStatus, LastCheck } from "@marcozvd/basics-core";

export type CheckTone = "pass" | "fail" | "muted";

export interface CheckChip {
  id: string;
  check: LastCheck;
  tone: CheckTone;
}

export function checkTone(status: CheckStatus): CheckTone {
  if (status === "pass") return "pass";
  if (status === "fail") return "fail";
  return "muted";
}

export function lastCheckChips(checks: Record<string, LastCheck> | undefined): CheckChip[] {
  if (!checks) return [];
  return Object.entries(checks).map(([id, check]) => ({ id, check, tone: checkTone(check.status) }));
}

/** Last `max` lines of captured output, for the chip tooltip. */
export function tailLines(output: string | undefined, max = 20): string[] {
  if (!output?.trim()) return [];
  return output.trimEnd().split(/\r?\n/).slice(-max);
}
