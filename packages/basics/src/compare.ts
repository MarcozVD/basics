import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  type AcceptanceResult,
  type AcceptanceSpec,
  type AgentId,
  atomicWrite,
  basicsDir,
  COMPARE_CONDITIONS,
  type CompareCondition,
  type CompareProgress,
  detectStack,
  isTrusted,
  type McpToolCalls,
  type Recommendation,
  readPackTasks,
  recommend,
  stackContext,
  type Vault,
} from "@marcozvd/basics-core";
import { AgentProcessTree } from "./agent-process-tree.js";
import { AGENT_IDS, AgentRunner, type AgentRunResult, AgentUnavailableError, onPath, type TokenUsage } from "./agents.js";
import { acceptanceResult, stageAcceptance, validateAcceptance } from "./compare-acceptance.js";
import { prepareCompareEnvironment } from "./compare-environment.js";
import { assertNoExternalOutputLinks, CompareDirectories, fileChanges, snapshotFiles } from "./compare-files.js";

export const DEFAULT_COMPARE_TIMEOUT_MS = 10 * 60 * 1000;
export interface CompareOptions {
  conditions?: CompareCondition[] | string;
  acceptance?: AcceptanceSpec;
  studyDir?: string;
  task?: string;
  sample?: string;
  agent: AgentId;
  model?: string;
  runs?: number;
  timeoutMs?: number;
  yes?: boolean;
  trustChecks?: boolean;
  keep?: boolean;
  language?: string;
}
export interface CompareDependencies {
  packsDir: string;
  tempRoot?: string;
  env?: NodeJS.ProcessEnv;
  authHome?: string;
  resolveExe?: (agent: AgentId) => string | undefined;
  isTTY?: boolean;
  confirm?: () => Promise<boolean>;
  confirmChecks?: (checks: { id: string; command: string }[]) => Promise<boolean>;
  announce?: (message: string) => void;
  signal?: AbortSignal;
  progress?: (event: CompareProgress) => void;
}
export function resolveCompareTask(options: CompareOptions, packs: string) {
  if (options.task?.trim() && options.sample) throw new Error("provide a task or --sample, not both");
  if (!options.sample) {
    if (!options.task?.trim()) throw new Error("provide a task or --sample <pack>/<task-id>");
    return { prompt: options.task.trim(), expectedLayers: undefined };
  }
  const match = /^([a-z0-9-]+)\/([a-z0-9-]+)$/.exec(options.sample);
  if (!match) throw new Error("--sample must be <pack>/<task-id>");
  const task = readPackTasks(packs, match[1]).find((task) => task.id === match[2]);
  if (!task) throw new Error(`sample not found: ${options.sample}`);
  return { prompt: task.prompt[options.language ?? "en"] ?? task.prompt.en, expectedLayers: task.expected_layers };
}
export function metricStats(values: number[]) {
  if (!values.length) return null;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    count: values.length,
    mean,
    stddev: Math.sqrt(values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}
interface CheckResult {
  id: string;
  command?: string;
  status: "pass" | "fail" | "skip" | "timeout" | "missing_tool" | "untrusted";
  hint?: string;
  duration_ms: number;
  output_tail?: string;
}
export interface CompareRunResult {
  run: number;
  condition: CompareCondition;
  mcp_tool_calls: McpToolCalls | null;
  acceptance: AcceptanceResult | null;
  contaminated: boolean;
  contamination_reasons: string[];
  shutdown_confirmed: boolean;
  ok: boolean;
  error?: string;
  timed_out: boolean;
  wall_ms: number;
  tokens: TokenUsage | null;
  stack_used: Record<string, string[]>;
  unknown_packages: ReturnType<typeof detectStack>["unknown"];
  stack_comparison: { layer: string; expected: string[]; used: string[]; match: boolean }[];
  stack_match: number | null;
  checks: CheckResult[];
  checks_passed: number;
  files: ReturnType<typeof fileChanges> | null;
  output: string;
  directory?: string;
  cleanup_errors: string[];
}
export function expectedCompareStack(advice: Recommendation): Record<string, string[]> {
  return Object.fromEntries(
    Object.entries(advice.layers).flatMap(([layer, candidates]) => {
      const candidate = candidates.find(
        (c) => c.kind !== "language" && c.score > 0 && c.score_breakdown.keywords + c.score_breakdown.text + c.score_breakdown.synonyms > 0,
      );
      return candidate ? [[layer, [candidate.id]]] : [];
    }),
  );
}
/** Shared by newly saved checks and public legacy-history responses. Paths belong only in --keep metadata. */
export function untrustedCheckHint(stack: string[], id: string): string {
  return `Review the listed commands and rerun compare with --trust-checks to approve checks for that invocation only. --yes never grants check trust. Alternatively, use --keep to retain the project, run basics export --stack ${stack.join(",")} in the project if basics.json is missing, then basics check <project> --only ${id} --trust with the same vault.`;
}

/** Keep agent identity and diagnostic text, but never persist executable/workspace paths in errors. */
export function compareErrorMessage(error: string | undefined, agent: AgentId): string | undefined {
  if (!error) return undefined;
  const message = error
    .replace(/(["'])(?:[A-Za-z]:[\\/]|\/|\\\\)[^\r\n]*?\1/g, "<path>")
    .replace(/(?:\b[A-Za-z]:[\\/]|\\\\)[^\r\n"'<>]*/g, "<path>")
    .replace(/(^|[\s(=])\/[^\r\n"'<>]*/gm, "$1<path>");
  return message.startsWith(`${agent}: `) ? message : `${agent}: ${message}`;
}

function checkEnvironment(project: string, inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const local = [".venv/Scripts", ".venv/bin", "venv/Scripts", "venv/bin", "node_modules/.bin"]
    .map((dir) => path.join(project, dir))
    .filter((dir) => fs.existsSync(dir) && fs.statSync(dir).isDirectory());
  const env = { ...inherited };
  const inheritedPath = env.PATH ?? env.Path ?? "";
  for (const key of Object.keys(env)) if (key.toLowerCase() === "path") delete env[key];
  env.PATH = [...local, inheritedPath].filter(Boolean).join(path.delimiter);
  return env;
}
function missingPrimaryTool(command: string, cwd: string, env: NodeJS.ProcessEnv): string | undefined {
  const first = /^\s*(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/.exec(command);
  const tool = first?.[1] ?? first?.[2] ?? first?.[3];
  if (
    !tool ||
    /[$%=]/.test(tool) ||
    new Set(["cd", "echo", "exit", "set", "export", "if", "for", "test", "true", "false", ".", "source", "call"]).has(tool)
  )
    return;
  if (/[\\/]/.test(tool) || path.isAbsolute(tool)) return fs.existsSync(path.resolve(cwd, tool)) ? undefined : tool;
  const pathValue = [process.platform === "win32" ? cwd : "", env.PATH ?? ""].filter(Boolean).join(path.delimiter);
  return onPath(tool, pathValue) || pathValue.split(path.delimiter).some((dir) => dir && fs.existsSync(path.join(dir, tool)))
    ? undefined
    : tool;
}
function executeCheck(
  command: string,
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeout: number,
  signal?: AbortSignal,
): Promise<Omit<CheckResult, "id"> & { stdout?: string; truncated?: boolean }> {
  env = checkEnvironment(cwd, env);
  const missing = missingPrimaryTool(command, cwd, env);
  if (missing) return Promise.resolve({ command, status: "missing_tool", duration_ms: 0, output_tail: `command not found: ${missing}` });
  return new Promise((resolve) => {
    const started = Date.now();
    let tail = "",
      stdout = "",
      truncated = false,
      timedOut = false,
      settled = false;
    const child = spawn(command, {
      cwd,
      env,
      shell: true,
      windowsHide: true,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const timer = setTimeout(() => {
      timedOut = true;
      void finish(null);
    }, timeout);
    const abort = () => {
      void finish(null);
    };
    const tree = new AgentProcessTree(child);
    const finish = async (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      await tree.shutdown();
      child.stdout?.destroy();
      child.stderr?.destroy();
      resolve({
        command,
        status: timedOut ? "timeout" : code === 0 ? "pass" : code === 127 || code === 9009 ? "missing_tool" : "fail",
        duration_ms: Date.now() - started,
        output_tail: tail,
        stdout,
        truncated,
      });
    };
    const capture = (chunk: Buffer) => {
      tail = (tail + chunk.toString()).slice(-4000);
    };
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 64_000) {
        truncated = true;
        stdout = stdout.slice(0, 64_000);
      }
      capture(chunk);
    });
    child.stderr?.on("data", capture);
    child.on("error", (error) => {
      tail = error.message;
      finish(null);
    });
    child.on("close", finish);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}
export function parseCompareConditions(value: CompareOptions["conditions"]): CompareCondition[] {
  const selected = typeof value === "string" ? value.split(",").map((c) => c.trim()) : (value ?? [...COMPARE_CONDITIONS]);
  if (
    !selected.length ||
    selected.some((c) => !COMPARE_CONDITIONS.includes(c as CompareCondition)) ||
    new Set(selected).size !== selected.length
  )
    throw new Error("--conditions must be a nonempty, unique subset of none,agents-md,basics");
  return selected as CompareCondition[];
}
export function planComparison(vault: Vault, options: CompareOptions, deps: Pick<CompareDependencies, "packsDir" | "tempRoot">) {
  const conditions = parseCompareConditions(options.conditions);
  const runs = options.runs ?? 1,
    timeout = options.timeoutMs ?? DEFAULT_COMPARE_TIMEOUT_MS;
  if (!AGENT_IDS.includes(options.agent)) throw new Error("--agent must be claude, opencode or codex");
  if (!Number.isSafeInteger(runs) || !Number.isSafeInteger(runs * conditions.length) || runs < 1)
    throw new Error("--runs must be a positive integer within the safe count limit");
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2_147_483_647)
    throw new Error("--timeout must be positive seconds within the timer limit");
  const task = resolveCompareTask(options, deps.packsDir);
  const advice = recommend(vault, task.prompt, { layers: task.expectedLayers });
  const expected = expectedCompareStack(advice);
  const stack = [...new Set(Object.values(expected).flat())];
  const checks = stackContext(vault, stack).checks;
  const commands = checks.flatMap((check) =>
    check.data.type === "check" && check.data.command ? [{ id: check.id, command: check.data.command }] : [],
  );
  if (options.acceptance) {
    validateAcceptance(options.acceptance);
    const bundle = fs.realpathSync(options.acceptance.bundle);
    for (const exposed of [vault.root, deps.tempRoot].filter((p): p is string => Boolean(p))) {
      const relative = path.relative(fs.realpathSync(exposed), bundle);
      if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)))
        throw new Error("acceptance bundle must be outside the vault and run directories");
    }
    commands.unshift({ id: "acceptance", command: options.acceptance.command });
  }
  return { runs, timeout, conditions, task, advice, expected, stack, checks, commands };
}
export async function runComparison(vault: Vault, options: CompareOptions, deps: CompareDependencies) {
  const { runs, timeout, conditions, task, advice, expected, stack, checks, commands } = planComparison(vault, options, deps);
  const interactive = deps.isTTY ?? process.stdin.isTTY;
  deps.announce?.(
    `Planned: ${runs * conditions.length} agent runs (${conditions.join(", ")}; ${runs} per condition). Timeout: ${timeout / 1000}s per condition. --yes approves agent runs only. --trust-checks approves listed checks in these fresh run directories for this invocation only; no vault trust is saved.`,
  );
  for (const check of commands)
    deps.announce?.(
      `Check ${check.id}: ${options.trustChecks ? "will run (--trust-checks)" : "untrusted (will not run without separate approval)"}: ${check.command}`,
    );
  if (!options.yes) {
    if (!interactive) throw new Error("compare requires --yes without an interactive terminal");
    if (!deps.confirm || !(await deps.confirm())) throw new Error("compare cancelled; no agent runs started");
  }
  const executable = deps.resolveExe ? deps.resolveExe(options.agent) : onPath(options.agent, deps.env?.PATH ?? process.env.PATH);
  if (!executable) throw new AgentUnavailableError(`${options.agent} is not installed (not on PATH)`);
  // Separate, invocation-local approval; --yes never authorizes shell commands.
  let checksApproved = options.trustChecks === true;
  if (!checksApproved && interactive && commands.length) checksApproved = (await deps.confirmChecks?.(commands)) === true;
  for (const check of commands)
    deps.announce?.(
      `Check ${check.id}: ${checksApproved ? "approved for this invocation (will run)" : "untrusted (will not run)"}: ${check.command}`,
    );
  const directories = new CompareDirectories();
  deps.progress?.({ phase: "planned" });
  const results: CompareRunResult[] = [];
  let interrupted = false;
  const prompt = `${task.prompt}\n\nImplement working files in the current project directory. Use supplied project instructions and available tools. Do not modify files outside this project or edit agent settings. Knowledge servers are read-only. Run relevant checks and finish with a brief summary.`;
  runsLoop: for (let run = 1; run <= runs; run++)
    for (const condition of conditions) {
      if (deps.signal?.aborted) {
        interrupted = true;
        break runsLoop;
      }
      deps.progress?.({ phase: "running", run, condition });
      let root: string | undefined;
      let prepared: ReturnType<typeof prepareCompareEnvironment> | undefined;
      let before: ReturnType<typeof snapshotFiles> | undefined;
      const cleanupErrors: string[] = [];
      const conditionStarted = Date.now();
      const deadline = conditionStarted + timeout;
      const protectedPaths = [
        options.studyDir,
        options.acceptance?.bundle,
        options.acceptance ? path.dirname(path.resolve(options.acceptance.bundle)) : undefined,
      ].filter((p): p is string => Boolean(p));
      try {
        const runner = new AgentRunner({
          timeoutMs: timeout,
          tempRoot: deps.tempRoot,
          keep: true,
          protectedPaths,
          resolveExe: () => executable,
          prepare: (dir) => {
            root = dir;
            directories.own(dir);
            prepared = prepareCompareEnvironment(dir, options.agent, vault, stack, condition, deps.env, deps.authHome, protectedPaths);
            directories.own(prepared.control);
            if (options.acceptance || options.studyDir) {
              const exposed = [prompt];
              const readText = (directory: string) => {
                for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
                  const file = path.join(directory, entry.name);
                  if (entry.isDirectory()) readText(file);
                  else if (entry.isFile() && !["auth.json", ".credentials.json"].includes(entry.name))
                    exposed.push(fs.readFileSync(file, "utf8"));
                }
              };
              readText(prepared.project);
              readText(prepared.control);
              const normalized = exposed.join("\n").replaceAll("\\", "/").toLowerCase();
              if (protectedPaths.some((p) => normalized.includes(path.resolve(p).replaceAll("\\", "/").toLowerCase())))
                throw new Error("study or acceptance location would be exposed to the agent");
            }
            before = snapshotFiles(prepared.project);
            deps.announce?.(`Check directory: ${prepared.project}`);
            for (const check of checks)
              if (check.data.type === "check" && check.data.command)
                deps.announce?.(
                  `Check ${check.id}: ${checksApproved || isTrusted(vault, prepared.project, check.data.command) ? "trusted (will run)" : "untrusted (will not run)"}: ${check.data.command}`,
                );
            return { cwd: prepared.project, env: prepared.env, args: prepared.args };
          },
        });
        const onInterrupt = () => {
          interrupted = true;
          if (runner.activeId) runner.cancel(runner.activeId);
        };
        process.once("SIGINT", onInterrupt);
        deps.signal?.addEventListener("abort", onInterrupt, { once: true });
        let agent: AgentRunResult;
        try {
          agent = await new Promise((resolve, reject) => {
            try {
              runner.start(
                { agent: options.agent, model: options.model, prompt, build: true },
                { onChunk: () => {}, onDone: (_id, result) => resolve(result) },
              );
              if (deps.signal?.aborted) onInterrupt();
            } catch (error) {
              reject(error);
            }
          });
        } finally {
          process.removeListener("SIGINT", onInterrupt);
          deps.signal?.removeEventListener("abort", onInterrupt);
        }
        if (!root || !prepared || !before) throw new Error("compare workspace setup did not finish");
        const runChecks: CheckResult[] = [];
        let detected: ReturnType<typeof detectStack> | undefined;
        let files: ReturnType<typeof fileChanges> | undefined;
        let measurementError: string | undefined;
        let acceptance: AcceptanceResult | null = null;
        try {
          assertNoExternalOutputLinks(root);
          detected = detectStack(vault, prepared.project);
          // Snapshot before harness extraction so acceptance files are not agent output.
          files = fileChanges(before, snapshotFiles(prepared.project));
          if (options.acceptance) {
            const reason = !checksApproved
              ? "Acceptance command not approved"
              : !agent.shutdown_confirmed
                ? "Agent process-tree shutdown unconfirmed"
                : !agent.ok || deps.signal?.aborted
                  ? "Agent failed, timed out or was cancelled"
                  : Date.now() >= deadline
                    ? "No acceptance time remaining"
                    : undefined;
            if (reason) acceptance = { status: "error", passed: null, failed: null, reason, duration_ms: 0 };
            else {
              const start = Date.now();
              try {
                stageAcceptance(options.acceptance, prepared.project);
                if (Date.now() >= deadline) throw new Error("No acceptance time remaining after extraction");
                const measured = await executeCheck(
                  options.acceptance.command,
                  prepared.project,
                  prepared.env,
                  deadline - Date.now(),
                  deps.signal,
                );
                acceptance = acceptanceResult(measured.stdout ?? "", measured.status, Date.now() - start, measured.truncated);
              } catch (error) {
                acceptance = {
                  status: "error",
                  passed: null,
                  failed: null,
                  reason: compareErrorMessage(String(error), options.agent),
                  duration_ms: Date.now() - start,
                };
              }
            }
            assertNoExternalOutputLinks(root);
          }
          for (const check of checks) {
            if (deps.signal?.aborted) {
              interrupted = true;
              break;
            }
            if (check.data.type !== "check") continue;
            if (check.data.command && !checksApproved && !isTrusted(vault, prepared.project, check.data.command)) {
              runChecks.push({
                id: check.id,
                command: check.data.command,
                status: "untrusted",
                duration_ms: 0,
                hint: untrustedCheckHint(stack, check.id),
              });
              deps.progress?.({ phase: "checks", run, condition, check: check.id, status: "untrusted" });
              continue;
            }
            if (!agent.ok || !check.data.command || Date.now() >= deadline) {
              runChecks.push({ id: check.id, command: check.data.command, status: "skip", duration_ms: 0 });
              deps.progress?.({ phase: "checks", run, condition, check: check.id, status: "skip" });
              continue;
            }
            deps.progress?.({ phase: "checks", run, condition, check: check.id });
            const {
              stdout: _stdout,
              truncated: _truncated,
              ...checkResult
            } = await executeCheck(check.data.command, prepared.project, prepared.env, Math.max(1, deadline - Date.now()), deps.signal);
            runChecks.push({
              id: check.id,
              ...checkResult,
            });
            deps.progress?.({ phase: "checks", run, condition, check: check.id, status: runChecks.at(-1)!.status });
            assertNoExternalOutputLinks(root);
          }
        } catch (error) {
          measurementError = error instanceof Error ? error.message : String(error);
          if (options.acceptance && !acceptance)
            acceptance = {
              status: "error",
              passed: null,
              failed: null,
              reason: "Unsafe or unreadable agent output; acceptance not staged",
              duration_ms: 0,
            };
        }
        const used: Record<string, string[]> = {};
        for (const tech of detected?.techs ?? []) {
          const note = vault.get(tech.id);
          if (note?.data.type !== "tech" || note.data.kind === "language") continue;
          for (const layer of [note.data.layer].flat()) {
            used[layer] ??= [];
            if (!used[layer].includes(note.id)) used[layer].push(note.id);
          }
        }
        const layerMatches = Object.entries(expected).map(([layer, ids]) => ({
          layer,
          expected: ids,
          used: used[layer] ?? [],
          match: ids.some((id) => used[layer]?.includes(id)),
        }));
        results.push({
          run,
          condition,
          mcp_tool_calls: agent.mcp_tool_calls ?? null,
          acceptance,
          contaminated: agent.contaminated ?? false,
          contamination_reasons: agent.contamination_reasons ?? [],
          shutdown_confirmed: agent.shutdown_confirmed ?? false,
          ok: agent.ok && !measurementError && !deps.signal?.aborted,
          error: compareErrorMessage(agent.error ?? measurementError, options.agent),
          timed_out: agent.timed_out ?? false,
          wall_ms: agent.duration_ms ?? 0,
          tokens: agent.tokens ?? null,
          stack_used: used,
          unknown_packages: detected?.unknown ?? [],
          stack_comparison: layerMatches,
          stack_match: layerMatches.length ? layerMatches.filter((r) => r.match).length / layerMatches.length : null,
          checks: runChecks,
          checks_passed: runChecks.filter((check) => check.status === "pass").length,
          files: files ?? null,
          output: agent.text.slice(-100_000),
          directory: options.keep ? prepared.project : undefined,
          cleanup_errors: cleanupErrors,
        });
        deps.progress?.({ phase: "condition-finished", run, condition });
        if (interrupted) break runsLoop;
      } finally {
        if (prepared)
          try {
            directories.remove(prepared.control);
          } catch (error) {
            cleanupErrors.push(compareErrorMessage(`cleanup ${prepared.control}: ${String(error)}`, options.agent)!);
          }
        if (root && (!options.keep || !prepared))
          try {
            directories.remove(root);
          } catch (error) {
            cleanupErrors.push(compareErrorMessage(`cleanup ${root}: ${String(error)}`, options.agent)!);
          }
      }
    }
  const summary = Object.fromEntries(
    conditions.map((condition) => {
      const all = results.filter((result) => result.condition === condition);
      const selected = all.filter((result) => !result.contaminated);
      return [
        condition,
        {
          runs: selected.length,
          successes: selected.filter((r) => r.ok).length,
          contaminated_runs: all.length - selected.length,
          mcp_tool_calls: metricStats(selected.flatMap((r) => (r.mcp_tool_calls ? [r.mcp_tool_calls.total] : []))),
          acceptance_passed: metricStats(
            selected.flatMap((r) => (r.acceptance && r.acceptance.status !== "error" ? [r.acceptance.status === "pass" ? 1 : 0] : [])),
          ),
          wall_ms: metricStats(selected.map((r) => r.wall_ms)),
          tokens_total: metricStats(selected.flatMap((r) => (r.tokens ? [r.tokens.total] : []))),
          checks_passed: metricStats(selected.map((r) => r.checks_passed)),
          stack_match: metricStats(selected.flatMap((r) => (r.stack_match === null ? [] : [r.stack_match]))),
          files_added: metricStats(selected.flatMap((r) => (r.files ? [r.files.added.length] : []))),
          files_changed: metricStats(selected.flatMap((r) => (r.files ? [r.files.changed.length] : []))),
          files_deleted: metricStats(selected.flatMap((r) => (r.files ? [r.files.deleted.length] : []))),
        },
      ];
    }),
  );
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}`;
  // Local results are the only intentional writes to the user's vault.
  for (const child of [".basics", ".basics/compare", ".basics/.gitignore"]) {
    const file = path.join(vault.root, child);
    try {
      if (fs.lstatSync(file).isSymbolicLink()) throw new Error("compare result path must not be a symlink or junction");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  const state = basicsDir(vault.root),
    storage = path.join(state, "compare");
  fs.mkdirSync(storage, { recursive: true });
  const ignore = path.join(state, ".gitignore");
  const ignoreText = fs.readFileSync(ignore, "utf8");
  if (!ignoreText.split(/\r?\n/).some((line) => ["*", "compare/", "/compare/"].includes(line.trim())))
    fs.appendFileSync(ignore, `${ignoreText.endsWith("\n") ? "" : "\n"}/compare/\n`);
  const file = path.join(storage, `${id}.json`);
  const report = {
    schema_version: 1,
    conditions,
    validity_note:
      "Acceptance bundles are staged after shutdown. No enforced filesystem isolation; event-based contamination detection can miss indirect or unreported reads. Contaminated runs are excluded from summaries.",
    id,
    at: new Date().toISOString(),
    task: task.prompt,
    sample: options.sample,
    agent: options.agent,
    model: options.model ?? null,
    runs,
    timeout_ms: timeout,
    keep: options.keep ?? false,
    trust_checks: checksApproved,
    cancelled: interrupted || Boolean(deps.signal?.aborted),
    recommendation: expected,
    mode: advice.mode,
    results,
    summary,
    file,
  };
  atomicWrite(file, `${JSON.stringify(report, null, 2)}\n`);
  deps.progress?.({ phase: interrupted || deps.signal?.aborted ? "cancelled" : "finished" });
  return report;
}
