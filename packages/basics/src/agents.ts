import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentId, AgentInfo, McpToolCalls } from "@marcozvd/basics-core";
import { AgentObservations } from "./agent-observations.js";
import { AgentProcessTree, waitForAgentExit } from "./agent-process-tree.js";
import { CompareDirectories } from "./compare-files.js";

/**
 * Coding-agent CLIs Basics can run headless to plan a stack. Detection, model listing and the
 * argument shapes live here; `connect.ts` shares `onPath` so both agree on what is installed.
 */

export const AGENT_IDS: readonly AgentId[] = ["claude", "opencode", "codex"];

const AGENT_NAMES: Record<AgentId, string> = {
  claude: "Claude Code",
  opencode: "OpenCode",
  codex: "Codex",
};

const AGENT_BIN: Record<AgentId, string> = { claude: "claude", opencode: "opencode", codex: "codex" };

/** Claude Code's built-in model aliases; any other string is passed through as a full model name. */
const CLAUDE_MODELS = ["default", "sonnet", "opus", "haiku"];

/** The read-only Basics tools a planner needs; nothing that writes into the run directory. */
const CLAUDE_ALLOWED_TOOLS = [
  "mcp__basics__get_vault_overview",
  "mcp__basics__recommend_stack",
  "mcp__basics__get_note",
  "mcp__basics__search_vault",
  "mcp__basics__list_layers",
  "mcp__basics__propose_note",
];

const OPENCODE_MODELS_TTL_MS = 10 * 60 * 1000;
const OPENCODE_MODELS_TIMEOUT_MS = 15_000;
const STDERR_TAIL = 4000;

export const DEFAULT_AGENT_TIMEOUT_MS = 5 * 60 * 1000;

/** Appended to the `plan-stack` prompt for a headless run: decide only, write nothing. */
export const AGENT_DECISION_SUFFIX =
  "\n\nAnswer only with the stack decision; do not create or edit files; you may use propose_note for missing notes.";

/** First directory on PATH that holds `bin`, honouring PATHEXT on Windows. */
export function onPath(bin: string, pathEnv = process.env.PATH ?? ""): string | undefined {
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean) : [""];
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = path.join(dir, bin + ext);
      if (fs.existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

export interface SpawnTarget {
  command: string;
  prefix: string[];
}

/**
 * Windows cannot spawn a `.cmd`/`.bat` without a shell, and a shell would reparse the prompt.
 * npm shims are followed to the program they wrap (a real `.exe`, or a `.js` run with this Node),
 * so every agent still starts with `shell: false` and an args array.
 */
export function spawnTarget(exe: string): SpawnTarget {
  if (process.platform !== "win32" || !/\.(cmd|bat)$/i.test(exe)) return { command: exe, prefix: [] };
  try {
    const dir = path.dirname(exe);
    const text = fs.readFileSync(exe, "utf8").replace(/%~dp0|%dp0%/gi, dir);
    for (const match of text.matchAll(/"([^"\r\n]+\.(?:exe|js|mjs|cjs))"|([^\s"'&|<>]+\.(?:exe|js|mjs|cjs))/gi)) {
      const candidate = (match[1] ?? match[2] ?? "").trim();
      if (!candidate) continue;
      const file = path.isAbsolute(candidate) ? candidate : path.resolve(dir, candidate);
      if (!fs.existsSync(file)) continue;
      if (/\.(js|mjs|cjs)$/i.test(file)) return { command: process.execPath, prefix: [file] };
      return { command: file, prefix: [] };
    }
  } catch {
    // A shim that cannot be read falls back to spawning it as-is.
  }
  return { command: exe, prefix: [] };
}

interface OpencodeModelsCache {
  exe: string;
  at: number;
  models: string[];
}

let opencodeModelsCache: OpencodeModelsCache | undefined;

/** Forget the cached `opencode models` list (tests). */
export function resetAgentCache(): void {
  opencodeModelsCache = undefined;
}

function readOpencodeModels(exe: string): string[] {
  const { command, prefix } = spawnTarget(exe);
  const result = spawnSync(command, [...prefix, "models"], {
    encoding: "utf8",
    timeout: OPENCODE_MODELS_TIMEOUT_MS,
    shell: false,
    windowsHide: true,
  });
  if (result.error || result.status !== 0 || !result.stdout) return [];
  const models = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[^\s/]+\/[^\s]+$/.test(line));
  return [...new Set(models)];
}

function opencodeModels(exe: string, now: number): string[] {
  if (opencodeModelsCache && opencodeModelsCache.exe === exe && now - opencodeModelsCache.at < OPENCODE_MODELS_TTL_MS) {
    return opencodeModelsCache.models;
  }
  const models = readOpencodeModels(exe);
  opencodeModelsCache = { exe, at: now, models };
  return models;
}

/** The top-level `model` of `~/.codex/config.toml`, the CLI's configured default. */
function readCodexModel(home: string): string | undefined {
  const file = path.join(home, ".codex", "config.toml");
  if (!fs.existsSync(file)) return undefined;
  try {
    return parseTomlModel(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function parseTomlModel(text: string): string | undefined {
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*\[/.test(line)) break;
    const match = /^\s*model\s*=\s*"((?:[^"\\]|\\.)*)"\s*(?:#.*)?$/.exec(line);
    if (match) return match[1].replace(/\\(.)/g, "$1");
  }
  return undefined;
}

/** The config file `basics connect` writes for OpenCode, preferring the one with content. */
function opencodeConfigFile(home: string): string {
  const json = path.join(home, ".config", "opencode", "opencode.json");
  const jsonc = path.join(home, ".config", "opencode", "opencode.jsonc");
  const hasContent = (file: string) => fs.existsSync(file) && fs.readFileSync(file, "utf8").trim().length > 0;
  if (hasContent(json)) return json;
  if (hasContent(jsonc)) return jsonc;
  return json;
}

/** Whether `basics` is registered for that agent; `unknown` when its config cannot be parsed. */
function basicsRegistered(id: AgentId, home: string): boolean | "unknown" {
  if (id === "codex") return tomlHasBasicsServer(path.join(home, ".codex", "config.toml"));
  const file = id === "claude" ? path.join(home, ".claude.json") : opencodeConfigFile(home);
  if (!fs.existsSync(file)) return false;
  try {
    const json = JSON.parse(fs.readFileSync(file, "utf8")) as {
      mcpServers?: Record<string, unknown>;
      mcp?: Record<string, unknown>;
    };
    return Boolean(id === "claude" ? json.mcpServers?.basics : json.mcp?.basics);
  } catch {
    return "unknown";
  }
}

function tomlHasBasicsServer(file: string): boolean | "unknown" {
  if (!fs.existsSync(file)) return false;
  try {
    return /^\s*\[mcp_servers\.basics\]/m.test(fs.readFileSync(file, "utf8"));
  } catch {
    return "unknown";
  }
}

export interface ListAgentsOptions {
  home?: string;
  /** Current time, so tests can exercise the `opencode models` cache. */
  now?: number;
}

/** Every supported agent, whether its CLI is installed and which models it offers. */
export function listAgents(opts: ListAgentsOptions = {}): AgentInfo[] {
  const home = opts.home ?? os.homedir();
  const now = opts.now ?? Date.now();
  return AGENT_IDS.map((id): AgentInfo => {
    const exe = onPath(AGENT_BIN[id]);
    let models: string[] = [];
    if (exe) {
      if (id === "claude") models = [...CLAUDE_MODELS];
      else if (id === "opencode") models = opencodeModels(exe, now);
      else {
        const model = readCodexModel(home);
        models = model ? [model] : [];
      }
    }
    return { id, name: AGENT_NAMES[id], detected: Boolean(exe), models, connected: basicsRegistered(id, home) };
  });
}

export type AgentOutputFormat = "stream-json" | "json" | "text" | "codex-json";

export interface AgentArgs {
  args: string[];
  format: AgentOutputFormat;
}

/** Arguments for one headless run, always an array: the prompt is one argument, never a shell line. */
export function agentArgs(agent: AgentId, prompt: string, model?: string, build = false): AgentArgs {
  const name = model?.trim();
  if (agent === "claude") {
    const args = ["-p", prompt];
    if (name && name !== "default") args.push("--model", name);
    args.push("--output-format", "stream-json", "--verbose");
    if (build) args.push("--dangerously-skip-permissions", "--strict-mcp-config");
    else args.push("--allowedTools", ...CLAUDE_ALLOWED_TOOLS);
    return { args, format: "stream-json" };
  }
  if (agent === "opencode") {
    const args = ["run", prompt];
    if (name) args.push("-m", name);
    args.push("--format", "json");
    if (build) args.push("--agent", "build");
    return { args, format: "json" };
  }
  const args = ["exec", prompt];
  if (name) args.push("-m", name);
  args.push("--skip-git-repo-check");
  if (build) args.push("--full-auto", "-c", 'approval_policy="never"', "--json");
  else args.push("--sandbox", "read-only");
  return { args, format: build ? "codex-json" : "text" };
}

function textBlocks(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const out: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const { type, text } = block as { type?: unknown; text?: unknown };
    if (type === "text" && typeof text === "string") out.push(text);
  }
  return out.join("");
}

function claudeEventText(event: Record<string, unknown>): string {
  if (event.type === "assistant") return textBlocks((event.message as { content?: unknown } | undefined)?.content);
  if (event.type === "content_block_delta") {
    const delta = event.delta as { type?: unknown; text?: unknown } | undefined;
    if (delta?.type === "text_delta" && typeof delta.text === "string") return delta.text;
  }
  return "";
}

function claudeFinalText(event: Record<string, unknown>): string | undefined {
  return event.type === "result" && typeof event.result === "string" ? event.result : undefined;
}

function opencodeEventText(event: Record<string, unknown>): string {
  if (event.type !== "text") return "";
  const part = event.part as { type?: unknown; text?: unknown } | undefined;
  if (typeof part?.text === "string") return part.text;
  return typeof event.text === "string" ? event.text : "";
}

/** Turns a CLI's stdout into the assistant text, streaming complete units as they arrive. */
interface StreamParser {
  push(chunk: string): string;
  flush(): string;
  text(): string;
}

class RawParser implements StreamParser {
  private readonly parts: string[] = [];
  push(chunk: string): string {
    this.parts.push(chunk);
    return chunk;
  }
  flush(): string {
    return "";
  }
  text(): string {
    return this.parts.join("");
  }
}

class JsonLinesParser implements StreamParser {
  private buffer = "";
  private readonly parts: string[] = [];
  private final: string | undefined;
  constructor(
    private readonly extract: (event: Record<string, unknown>) => string,
    private readonly finalOf?: (event: Record<string, unknown>) => string | undefined,
    /** Inserted before every part after the first, so whole parts do not glue together. */
    private readonly separator = "",
    private readonly onEvent?: (event: Record<string, unknown>) => void,
  ) {}

  push(chunk: string): string {
    this.buffer += chunk;
    const out: string[] = [];
    let index = this.buffer.indexOf("\n");
    while (index !== -1) {
      const text = this.consume(this.buffer.slice(0, index));
      this.buffer = this.buffer.slice(index + 1);
      if (text) out.push(text);
      index = this.buffer.indexOf("\n");
    }
    return out.join("");
  }

  flush(): string {
    const text = this.consume(this.buffer);
    this.buffer = "";
    return text;
  }

  text(): string {
    return this.final ?? this.parts.join("");
  }

  private consume(line: string): string {
    const trimmed = line.trim();
    if (!trimmed) return "";
    let event: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "";
      event = parsed as Record<string, unknown>;
      this.onEvent?.(event);
    } catch {
      // A CLI that logs a plain line still streams it; the UI decides what to show.
      this.onEvent?.({ type: "basics.invalid-stream" });
      return this.emit(trimmed);
    }
    const final = this.finalOf?.(event);
    if (final !== undefined) this.final = final;
    const text = this.extract(event);
    return text ? this.emit(text) : "";
  }

  /** Records one part, prefixed by the separator once something has already been emitted. */
  private emit(text: string): string {
    const piece = this.parts.length > 0 ? `${this.separator}${text}` : text;
    this.parts.push(piece);
    return piece;
  }
}

function parserFor(format: AgentOutputFormat, onEvent?: (event: Record<string, unknown>) => void): StreamParser {
  if (format === "stream-json") return new JsonLinesParser(claudeEventText, claudeFinalText, "", onEvent);
  if (format === "codex-json")
    return new JsonLinesParser(
      (event) => {
        const item = event.item as { type?: string; text?: string } | undefined;
        return event.type === "item.completed" && item?.type === "agent_message" ? (item.text ?? "") : "";
      },
      undefined,
      "\n\n",
      onEvent,
    );
  // OpenCode emits whole text parts, not deltas: a blank line keeps them from gluing together.
  if (format === "json") return new JsonLinesParser(opencodeEventText, undefined, "\n\n", onEvent);
  return new RawParser();
}

export class AgentBusyError extends Error {}
export class AgentUnavailableError extends Error {}

export interface AgentRunOptions {
  agent: AgentId;
  model?: string;
  prompt: string;
  /** Compare only: allow file generation in the fresh workspace. Planner defaults stay read-only. */
  build?: boolean;
}

export interface TokenUsage {
  input: number;
  output: number;
  /** Input plus output only; provider-reported cache usage is separate. */
  total: number;
  cache_read?: number;
  cache_creation?: number;
}

export interface AgentRunResult {
  mcp_tool_calls?: McpToolCalls | null;
  contaminated?: boolean;
  contamination_reasons?: string[];
  shutdown_confirmed?: boolean;
  ok: boolean;
  text: string;
  error?: string;
  tokens?: TokenUsage;
  duration_ms?: number;
  timed_out?: boolean;
}

export interface AgentRunCallbacks {
  onChunk: (runId: string, chunk: string) => void;
  onDone: (runId: string, result: AgentRunResult) => void;
}

export interface AgentRunnerOptions {
  protectedPaths?: string[];
  /** Parent of the fresh, empty per-run directory. Default: the OS temp directory. */
  tempRoot?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  /** Override the executable lookup (tests). */
  resolveExe?: (agent: AgentId) => string | undefined;
  /** Compare retains the owned directory for measurements and performs link-safe cleanup itself. */
  keep?: boolean;
  prepare?: (dir: string) => { cwd?: string; env?: NodeJS.ProcessEnv; args?: string[] };
}

interface ActiveRun {
  id: string;
  child: ChildProcess;
  dir: string;
  cancelled: boolean;
  timedOut: boolean;
  stop: () => void;
}

function exitError(code: number | null, stderr: string): string {
  const tail = stderr
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join("\n");
  const reason = code === null ? "was killed before it finished" : `exited with code ${code}`;
  return tail ? `the agent ${reason}:\n${tail}` : `the agent ${reason}`;
}

/**
 * Runs one agent at a time in a fresh empty directory, with `shell: false`, a 5-minute
 * timeout and streamed output. A second run while one is active throws `AgentBusyError`.
 */
export class AgentRunner {
  private active?: ActiveRun;
  private readonly timeoutMs: number;
  constructor(private readonly opts: AgentRunnerOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_AGENT_TIMEOUT_MS;
  }

  get activeId(): string | undefined {
    return this.active?.id;
  }

  start(opts: AgentRunOptions, callbacks: AgentRunCallbacks): string {
    if (this.active) throw new AgentBusyError("an agent is already running");
    const exe = this.opts.resolveExe ? this.opts.resolveExe(opts.agent) : onPath(AGENT_BIN[opts.agent]);
    if (!exe) throw new AgentUnavailableError(`${AGENT_NAMES[opts.agent]} is not installed (no "${AGENT_BIN[opts.agent]}" on PATH)`);

    const runId = randomUUID();
    const dir = fs.mkdtempSync(path.join(this.opts.tempRoot ?? os.tmpdir(), "basics-agent-"));
    const owned = new CompareDirectories();
    owned.own(dir);
    const setupFailure = (error: unknown): never => {
      if (!this.opts.keep) owned.remove(dir);
      throw error;
    };
    const target = spawnTarget(exe);
    const { args, format } = agentArgs(opts.agent, opts.prompt, opts.model, opts.build);
    let prepared: ReturnType<NonNullable<AgentRunnerOptions["prepare"]>>;
    try {
      prepared = this.opts.prepare?.(dir) ?? {};
    } catch (error) {
      // The compare owner retains cleanup responsibility even when setup fails.
      return setupFailure(error);
    }
    const cwd = prepared.cwd ?? dir;
    try {
      const relative = path.relative(fs.realpathSync(dir), fs.realpathSync(cwd));
      if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("agent workspace must be inside its fresh run directory");
    } catch (error) {
      return setupFailure(error);
    }
    let usage: TokenUsage | undefined;
    const observations = new AgentObservations(opts.agent, cwd, this.opts.protectedPaths);
    const parser = parserFor(format, (event) => {
      if (opts.build) observations.observe(event);
      const part = event.part as { tokens?: { input?: number; output?: number } } | undefined;
      const counts = (
        opts.agent === "opencode" && event.type === "step_finish"
          ? part?.tokens
          : event.type === "result" || event.type === "turn.completed"
            ? event.usage
            : undefined
      ) as
        | {
            input_tokens?: number;
            output_tokens?: number;
            input?: number;
            output?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
            cached_input_tokens?: number;
            cache_write_input_tokens?: number;
            cache?: { read?: number; write?: number };
          }
        | undefined;
      if (!counts) return;
      let input = counts.input_tokens ?? counts.input;
      const output = counts.output_tokens ?? counts.output;
      if (typeof input !== "number" || typeof output !== "number" || !Number.isFinite(input + output) || input < 0 || output < 0) return;
      const caches =
        opts.agent === "codex"
          ? { cache_read: counts.cached_input_tokens, cache_creation: counts.cache_write_input_tokens }
          : opts.agent === "claude"
            ? { cache_read: counts.cache_read_input_tokens, cache_creation: counts.cache_creation_input_tokens }
            : { cache_read: counts.cache?.read, cache_creation: counts.cache?.write };
      // Codex protocol.rs non_cached_input(): input_tokens includes cached_input_tokens.
      if (opts.agent === "codex" && typeof caches.cache_read === "number" && Number.isFinite(caches.cache_read) && caches.cache_read >= 0)
        input = Math.max(0, input - caches.cache_read);
      // Claude input is already separate. OpenCode step_finish tokens.input is also normalized:
      // https://github.com/anomalyco/opencode/blob/v1.3.16/packages/opencode/src/session/index.ts#L257-L271
      const sum = opts.agent !== "claude" ? usage : undefined;
      usage = { input: (sum?.input ?? 0) + input, output: (sum?.output ?? 0) + output, total: (sum?.total ?? 0) + input + output };
      for (const key of ["cache_read", "cache_creation"] as const) {
        const value = caches[key];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) usage[key] = (sum?.[key] ?? 0) + value;
        else if (sum?.[key] !== undefined) usage[key] = sum[key];
      }
    });
    const started = Date.now();
    let child: ChildProcess;
    try {
      child = spawn(target.command, [...target.prefix, ...args, ...(prepared.args ?? [])], {
        cwd,
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: prepared.env ?? this.opts.env ?? process.env,
        detached: opts.build && process.platform !== "win32",
      });
    } catch (error) {
      return setupFailure(error);
    }

    const tree = opts.build ? new AgentProcessTree(child) : undefined;
    const run: ActiveRun = { id: runId, child, dir, cancelled: false, timedOut: false, stop: () => void settle() };
    this.active = run;

    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      run.timedOut = true;
      void settle();
    }, this.timeoutMs);

    const settle = async (error?: string, code: number | null = null): Promise<void> => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const shutdownConfirmed = tree ? await tree.shutdown() : undefined;
      if (!opts.build && (run.cancelled || run.timedOut)) {
        stopAgentProcess(child);
        await waitForAgentExit(child);
      }
      if (opts.build) {
        child.stdout?.destroy();
        child.stderr?.destroy();
      }
      const trailing = parser.flush();
      if (trailing) callbacks.onChunk(runId, trailing);
      if (this.active?.id === runId) this.active = undefined;
      let cleanupError: string | undefined;
      try {
        if (!this.opts.keep) owned.remove(dir);
      } catch (error) {
        cleanupError = `cleanup failed for ${dir}: ${String(error)}`;
      }
      const failure =
        error ??
        (run.cancelled
          ? "cancelled"
          : run.timedOut
            ? opts.build
              ? `the agent timed out after ${this.timeoutMs / 1000} seconds`
              : "the agent timed out after 5 minutes"
            : code === 0
              ? undefined
              : exitError(code, stderr));
      const result: AgentRunResult = { ok: !failure && !cleanupError, text: parser.text() };
      if (opts.build) {
        result.shutdown_confirmed = shutdownConfirmed;
        result.mcp_tool_calls = observations.calls(!run.cancelled && !run.timedOut);
        result.contaminated = observations.contamination.length > 0;
        result.contamination_reasons = observations.contamination;
        result.duration_ms = Date.now() - started;
        result.timed_out = run.timedOut;
        if (usage) result.tokens = usage;
      }
      if (failure || cleanupError) result.error = [failure, cleanupError].filter(Boolean).join("; ");
      callbacks.onDone(runId, result);
    };

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      const text = parser.push(chunk);
      if (text) callbacks.onChunk(runId, text);
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-STDERR_TAIL);
    });
    child.on("error", (err) => settle(`could not start ${AGENT_NAMES[opts.agent]}: ${err.message}`));
    child.on("close", (code) => settle(undefined, code));
    if (opts.build) child.on("exit", (code) => void settle(undefined, code));

    return runId;
  }

  /** Kill the active run; false when the id is unknown or already finished. */
  cancel(id: string): boolean {
    const run = this.active;
    if (!run || run.id !== id) return false;
    run.cancelled = true;
    run.stop();
    return true;
  }
}

/** Kill the compare process group/tree on timeout, without parsing a shell command. */
export function stopAgentProcess(child: ChildProcess, tree = false): void {
  if (tree && child.pid) {
    if (process.platform === "win32") {
      const killer = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
      spawnSync(killer, ["/pid", String(child.pid), "/T", "/F"], { shell: false, windowsHide: true, stdio: "ignore", timeout: 5000 });
    } else {
      try {
        process.kill(-child.pid, "SIGKILL");
        return;
      } catch {
        /* Already exited. */
      }
    }
  }
  child.kill();
}
