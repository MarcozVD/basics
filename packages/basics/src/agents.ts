import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentId, AgentInfo } from "@marcozvd/basics-core";

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

export type AgentOutputFormat = "stream-json" | "json" | "text";

export interface AgentArgs {
  args: string[];
  format: AgentOutputFormat;
}

/** Arguments for one headless run, always an array: the prompt is one argument, never a shell line. */
export function agentArgs(agent: AgentId, prompt: string, model?: string): AgentArgs {
  const name = model?.trim();
  if (agent === "claude") {
    const args = ["-p", prompt];
    if (name && name !== "default") args.push("--model", name);
    args.push("--output-format", "stream-json", "--verbose", "--allowedTools", ...CLAUDE_ALLOWED_TOOLS);
    return { args, format: "stream-json" };
  }
  if (agent === "opencode") {
    const args = ["run", prompt];
    if (name) args.push("-m", name);
    args.push("--format", "json");
    return { args, format: "json" };
  }
  const args = ["exec", prompt];
  if (name) args.push("-m", name);
  args.push("--skip-git-repo-check", "--sandbox", "read-only");
  return { args, format: "text" };
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
    } catch {
      // A CLI that logs a plain line still streams it; the UI decides what to show.
      this.parts.push(trimmed);
      return trimmed;
    }
    const final = this.finalOf?.(event);
    if (final !== undefined) this.final = final;
    const text = this.extract(event);
    if (text) this.parts.push(text);
    return text;
  }
}

function parserFor(format: AgentOutputFormat): StreamParser {
  if (format === "stream-json") return new JsonLinesParser(claudeEventText, claudeFinalText);
  if (format === "json") return new JsonLinesParser(opencodeEventText);
  return new RawParser();
}

export class AgentBusyError extends Error {}
export class AgentUnavailableError extends Error {}

export interface AgentRunOptions {
  agent: AgentId;
  model?: string;
  prompt: string;
}

export interface AgentRunResult {
  ok: boolean;
  text: string;
  error?: string;
}

export interface AgentRunCallbacks {
  onChunk: (runId: string, chunk: string) => void;
  onDone: (runId: string, result: AgentRunResult) => void;
}

export interface AgentRunnerOptions {
  /** Parent of the fresh, empty per-run directory. Default: the OS temp directory. */
  tempRoot?: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  /** Override the executable lookup (tests). */
  resolveExe?: (agent: AgentId) => string | undefined;
}

interface ActiveRun {
  id: string;
  child: ChildProcess;
  dir: string;
  cancelled: boolean;
  timedOut: boolean;
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
    const exe = this.opts.resolveExe?.(opts.agent) ?? onPath(AGENT_BIN[opts.agent]);
    if (!exe) throw new AgentUnavailableError(`${AGENT_NAMES[opts.agent]} is not installed (no "${AGENT_BIN[opts.agent]}" on PATH)`);

    const runId = randomUUID();
    const dir = fs.mkdtempSync(path.join(this.opts.tempRoot ?? os.tmpdir(), "basics-agent-"));
    const target = spawnTarget(exe);
    const { args, format } = agentArgs(opts.agent, opts.prompt, opts.model);
    const parser = parserFor(format);
    const child = spawn(target.command, [...target.prefix, ...args], {
      cwd: dir,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: this.opts.env ?? process.env,
    });

    const run: ActiveRun = { id: runId, child, dir, cancelled: false, timedOut: false };
    this.active = run;

    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      run.timedOut = true;
      child.kill();
    }, this.timeoutMs);

    const settle = (error?: string, code: number | null = null): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const trailing = parser.flush();
      if (trailing) callbacks.onChunk(runId, trailing);
      if (this.active?.id === runId) this.active = undefined;
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // A locked temp directory is not worth failing the run over.
      }
      const failure =
        error ??
        (run.cancelled
          ? "cancelled"
          : run.timedOut
            ? "the agent timed out after 5 minutes"
            : code === 0
              ? undefined
              : exitError(code, stderr));
      const result: AgentRunResult = { ok: !failure, text: parser.text() };
      if (failure) result.error = failure;
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

    return runId;
  }

  /** Kill the active run; false when the id is unknown or already finished. */
  cancel(id: string): boolean {
    const run = this.active;
    if (!run || run.id !== id) return false;
    run.cancelled = true;
    run.child.kill();
    return true;
  }
}
