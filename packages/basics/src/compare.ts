import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  type AgentId,
  atomicWrite,
  basicsDir,
  detectStack,
  isTrusted,
  type Recommendation,
  readPackTasks,
  recommend,
  stackContext,
  type Vault,
} from "@marcozvd/basics-core";
import { AGENT_IDS, AgentRunner, type AgentRunResult, AgentUnavailableError, onPath, stopAgentProcess, type TokenUsage } from "./agents.js";
import { prepareCompareEnvironment } from "./compare-environment.js";
import { assertNoExternalOutputLinks, CompareDirectories, fileChanges, snapshotFiles } from "./compare-files.js";

export const DEFAULT_COMPARE_TIMEOUT_MS = 10 * 60 * 1000;
export interface CompareOptions {
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
  condition: "without_basics" | "with_basics";
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
function executeCheck(command: string, cwd: string, env: NodeJS.ProcessEnv, timeout: number): Promise<Omit<CheckResult, "id">> {
  env = checkEnvironment(cwd, env);
  const missing = missingPrimaryTool(command, cwd, env);
  if (missing) return Promise.resolve({ command, status: "missing_tool", duration_ms: 0, output_tail: `command not found: ${missing}` });
  return new Promise((resolve) => {
    const started = Date.now();
    let tail = "",
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
      stopAgentProcess(child, true);
    }, timeout);
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        command,
        status: timedOut ? "timeout" : code === 0 ? "pass" : code === 127 || code === 9009 ? "missing_tool" : "fail",
        duration_ms: Date.now() - started,
        output_tail: tail,
      });
    };
    const capture = (chunk: Buffer) => {
      tail = (tail + chunk.toString()).slice(-4000);
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    child.on("error", (error) => {
      tail = error.message;
      finish(null);
    });
    child.on("close", finish);
  });
}
export async function runComparison(vault: Vault, options: CompareOptions, deps: CompareDependencies) {
  const runs = options.runs ?? 1,
    timeout = options.timeoutMs ?? DEFAULT_COMPARE_TIMEOUT_MS;
  if (!AGENT_IDS.includes(options.agent)) throw new Error("--agent must be claude, opencode or codex");
  if (!Number.isSafeInteger(runs) || !Number.isSafeInteger(runs * 2) || runs < 1)
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
  const interactive = deps.isTTY ?? process.stdin.isTTY;
  deps.announce?.(
    `Planned: ${runs * 2} agent runs (${runs} without Basics, ${runs} with Basics). Timeout: ${timeout / 1000}s per condition. --yes approves agent runs only. --trust-checks approves listed checks in these fresh run directories for this invocation only; no vault trust is saved.`,
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
  const results: CompareRunResult[] = [];
  let interrupted = false;
  const prompt = `${task.prompt}\n\nImplement working files in the current project directory. Use supplied project instructions and available tools. Do not modify files outside this project or edit agent settings. Knowledge servers are read-only. Run relevant checks and finish with a brief summary.`;
  runsLoop: for (let run = 1; run <= runs; run++)
    for (const condition of ["without_basics", "with_basics"] as const) {
      let root: string | undefined;
      let prepared: ReturnType<typeof prepareCompareEnvironment> | undefined;
      let before: ReturnType<typeof snapshotFiles> | undefined;
      const cleanupErrors: string[] = [];
      try {
        const runner = new AgentRunner({
          timeoutMs: timeout,
          tempRoot: deps.tempRoot,
          keep: true,
          resolveExe: () => executable,
          prepare: (dir) => {
            root = dir;
            directories.own(dir);
            prepared = prepareCompareEnvironment(dir, options.agent, vault, stack, condition === "with_basics", deps.env, deps.authHome);
            directories.own(prepared.control);
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
        let agent: AgentRunResult;
        try {
          agent = await new Promise((resolve, reject) => {
            try {
              runner.start(
                { agent: options.agent, model: options.model, prompt, build: true },
                { onChunk: () => {}, onDone: (_id, result) => resolve(result) },
              );
            } catch (error) {
              reject(error);
            }
          });
        } finally {
          process.removeListener("SIGINT", onInterrupt);
        }
        if (!root || !prepared || !before) throw new Error("compare workspace setup did not finish");
        const runChecks: CheckResult[] = [];
        let detected: ReturnType<typeof detectStack> | undefined;
        let files: ReturnType<typeof fileChanges> | undefined;
        let measurementError: string | undefined;
        try {
          assertNoExternalOutputLinks(root);
          detected = detectStack(vault, prepared.project);
          const deadline = Date.now() + Math.max(0, timeout - (agent.duration_ms ?? 0));
          for (const check of checks) {
            if (check.data.type !== "check") continue;
            if (check.data.command && !checksApproved && !isTrusted(vault, prepared.project, check.data.command)) {
              runChecks.push({
                id: check.id,
                command: check.data.command,
                status: "untrusted",
                duration_ms: 0,
                hint: `Review the listed commands and rerun compare with --trust-checks to approve checks for that invocation only. --yes never grants check trust. Alternatively, use --keep to retain this project, run basics export --stack ${stack.join(",")} in the project if basics.json is missing, then basics check ${JSON.stringify(prepared.project)} --only ${check.id} --trust with the same vault.`,
              });
              continue;
            }
            if (!agent.ok || !check.data.command || Date.now() >= deadline) {
              runChecks.push({ id: check.id, status: "skip", duration_ms: 0 });
              continue;
            }
            runChecks.push({
              id: check.id,
              ...(await executeCheck(check.data.command, prepared.project, prepared.env, Math.max(1, deadline - Date.now()))),
            });
            assertNoExternalOutputLinks(root);
          }
          files = fileChanges(before, snapshotFiles(prepared.project));
        } catch (error) {
          measurementError = error instanceof Error ? error.message : String(error);
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
          ok: agent.ok && !measurementError,
          error: agent.error ?? measurementError,
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
        if (interrupted) break runsLoop;
      } finally {
        if (prepared)
          try {
            directories.remove(prepared.control);
          } catch (error) {
            cleanupErrors.push(`cleanup ${prepared.control}: ${String(error)}`);
          }
        if (root && (!options.keep || !prepared))
          try {
            directories.remove(root);
          } catch (error) {
            cleanupErrors.push(`cleanup ${root}: ${String(error)}`);
          }
      }
    }
  const summary = Object.fromEntries(
    (["without_basics", "with_basics"] as const).map((condition) => {
      const selected = results.filter((result) => result.condition === condition);
      return [
        condition,
        {
          runs: selected.length,
          successes: selected.filter((r) => r.ok).length,
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
    recommendation: expected,
    mode: advice.mode,
    results,
    summary,
    file,
  };
  atomicWrite(file, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
