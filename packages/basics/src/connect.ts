import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { atomicWrite } from "@marcozvd/basics-core";
import { onPath } from "./agents.js";
import { editGoose, gooseEntry } from "./connect-goose.js";
import { patchPresetJson, readPresetJson } from "./connect-json.js";

export const CONNECT_CLIENTS = [
  "claude-code",
  "opencode",
  "codex",
  "cursor",
  "claude-desktop",
  "oh-my-pi",
  "gemini-cli",
  "qwen-code",
  "kimi-cli",
  "goose",
  "amp",
] as const;
export type ConnectClient = (typeof CONNECT_CLIENTS)[number];
const JSON_PRESETS = new Set<ConnectClient>(["oh-my-pi", "gemini-cli", "qwen-code", "kimi-cli", "amp"]);
export type ConnectTransport = "stdio" | "http";
export type ConnectOutcome = "registered" | "updated" | "unchanged" | "skipped" | "dry-run" | "manual" | "error";
export type DisconnectOutcome = "removed" | "absent" | "dry-run" | "manual" | "error";

export interface ConnectOptions {
  /** Absolute path of the global vault every client points at. */
  vault: string;
  /** Clients to configure. Default: every client detected on this machine. */
  clients?: readonly string[];
  transport?: ConnectTransport;
  port?: number;
  /** Install `skills/basics/SKILL.md` for the clients that support skills. Default true. */
  skill?: boolean;
  dryRun?: boolean;
}

export interface ConnectSkillResult {
  path: string;
  result: "copied" | "unchanged" | "dry-run" | "error";
  message?: string;
  diff?: string;
}

export interface ConnectEntry {
  client: ConnectClient;
  detected: boolean;
  /** File or command used to configure this client. */
  target: string;
  /** One line describing what this run changes. */
  change: string;
  result: ConnectOutcome;
  message?: string;
  diff?: string;
  skill?: ConnectSkillResult;
}

export interface ConnectResult {
  vault: string;
  transport: ConnectTransport;
  /** HTTP endpoint, only for `--transport http`. */
  url?: string;
  /** argv used for the stdio transport. */
  command: string[];
  entries: ConnectEntry[];
  /** Set when the skill could not be found in the package. */
  skillError?: string;
}

/** One row of `GET /api/connect/status`: what a client has installed and whether it points here. */
export interface ConnectStatusEntry {
  client: ConnectClient;
  /** The client's config directory or binary exists on this machine. */
  detected: boolean;
  /** The config already points this client at this vault (stdio argv) or a local MCP URL. */
  connected: boolean;
  /** Transport of the entry found, only when `connected`. */
  transport?: ConnectTransport;
  /** The Basics skill is installed; `null` when this client has no skill support. */
  skill: boolean | null;
  /** Config file, `~/`-shortened for display. */
  configPath: string;
}

export interface ConnectStatusResult {
  vault: string;
  clients: ConnectStatusEntry[];
  snippets: ReturnType<typeof connectSnippets>;
}

export interface ConnectStatusOptions {
  /** Absolute path of the current vault. */
  vault: string;
  home?: string;
  url?: string;
}

export interface DisconnectSkillResult {
  path: string;
  result: "removed" | "absent" | "dry-run" | "error";
  message?: string;
}

export interface DisconnectEntry {
  client: ConnectClient;
  detected: boolean;
  /** File (or claude CLI) used to unregister this client. */
  target: string;
  /** One line describing what this run changes. */
  change: string;
  result: DisconnectOutcome;
  message?: string;
  diff?: string;
  skill?: DisconnectSkillResult;
}

export interface DisconnectResult {
  entries: DisconnectEntry[];
}

export interface DisconnectOptions {
  /** Clients to clean up. Default: every client. */
  clients?: readonly string[];
  /** Also remove `skills/basics/SKILL.md`. Default true. */
  skill?: boolean;
  dryRun?: boolean;
  home?: string;
}

interface FileEdit {
  file: string;
  before: string | null;
  after: string;
  changed: boolean;
  existed: boolean;
  parseError?: string;
}

const SKILL_DIRS: Partial<Record<ConnectClient, (home: string) => string>> = {
  "claude-code": (home) => path.join(home, ".claude", "skills", "basics"),
  opencode: (home) => path.join(home, ".config", "opencode", "skills", "basics"),
  codex: (home) => path.join(home, ".codex", "skills", "basics"),
  "oh-my-pi": (home) => path.join(home, ".omp", "agent", "skills", "basics"),
  "gemini-cli": (home) => path.join(home, ".gemini", "skills", "basics"),
  "qwen-code": (home) => path.join(home, ".qwen", "skills", "basics"),
  "kimi-cli": (home) => path.join(home, ".kimi", "skills", "basics"),
  goose: (home) => path.join(home, ".agents", "skills", "basics"),
  amp: (home) => path.join(home, ".config", "amp", "skills", "basics"),
};

const SERVER_RELATIVE = path.join("dist", "mcp", "server.js");

/** An MCP endpoint this machine serves: the UI's `http://127.0.0.1:<port>/mcp`. */
const LOCAL_MCP_URL = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?\/mcp\/?$/i;

function packageRoot(): string {
  return path.resolve(import.meta.dirname, "..");
}

/** argv every stdio client gets: the current Node, this package's server, the vault. */
export function connectCommand(vault: string): string[] {
  const node = process.env.BASICS_CONNECT_NODE || process.execPath;
  const server = process.env.BASICS_CONNECT_SERVER || path.join(packageRoot(), SERVER_RELATIVE);
  return [node, server, path.resolve(vault)];
}

/** Copyable configuration uses the same runtime and server as automatic registration. */
export function connectSnippets(vault: string, url = "http://127.0.0.1:4747/mcp") {
  const command = connectCommand(vault);
  const quote = (arg: string) => (process.platform === "win32" ? `'${arg.replace(/'/g, "''")}'` : `'${arg.replace(/'/g, "'\\''")}'`);
  return {
    json: JSON.stringify({ mcpServers: { basics: { command: command[0], args: command.slice(1) } } }, null, 2),
    toml: `[mcp_servers.basics]\ncommand = ${tomlString(command[0])}\nargs = [${command.slice(1).map(tomlString).join(", ")}]`,
    http: url,
    command: `${process.platform === "win32" ? "& " : ""}${command.map(quote).join(" ")}`,
  };
}

/** `skills/basics/SKILL.md` from the npm package or, when running from source, the repo. */
export function skillSourcePath(): string {
  const override = process.env.BASICS_CONNECT_SKILL;
  const root = packageRoot();
  const candidates = [
    override,
    path.join(root, "dist", "skills", "basics", "SKILL.md"),
    path.join(root, "skills", "basics", "SKILL.md"),
    path.resolve(root, "..", "..", "skills", "basics", "SKILL.md"),
  ].filter((candidate): candidate is string => Boolean(candidate));
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`skill not found (looked in ${candidates.join(", ")})`);
  return found;
}

function hasContent(file: string): boolean {
  return fs.existsSync(file) && fs.readFileSync(file, "utf8").trim().length > 0;
}

function opencodeFile(home: string): string {
  const json = path.join(home, ".config", "opencode", "opencode.json");
  const jsonc = path.join(home, ".config", "opencode", "opencode.jsonc");
  if (hasContent(json)) return json;
  if (hasContent(jsonc)) return jsonc;
  return json;
}

function claudeDesktopDir(home: string): string {
  if (process.platform === "win32") return path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "Claude");
  if (process.platform === "darwin") return path.join(home, "Library", "Application Support", "Claude");
  return path.join(home, ".config", "Claude");
}

function clientFile(client: ConnectClient, home: string): string {
  switch (client) {
    case "claude-code":
      return path.join(home, ".claude.json");
    case "opencode":
      return opencodeFile(home);
    case "codex":
      return path.join(home, ".codex", "config.toml");
    case "cursor":
      return path.join(home, ".cursor", "mcp.json");
    case "claude-desktop":
      return path.join(claudeDesktopDir(home), "claude_desktop_config.json");
    case "oh-my-pi":
      return path.join(home, ".omp", "agent", "mcp.json");
    case "gemini-cli":
      return path.join(home, ".gemini", "settings.json");
    case "qwen-code":
      return path.join(home, ".qwen", "settings.json");
    case "kimi-cli":
      return path.join(home, ".kimi", "mcp.json");
    case "goose":
      return process.platform === "win32"
        ? path.join(process.env.APPDATA ?? path.join(home, "AppData", "Roaming"), "Block", "goose", "config", "config.yaml")
        : path.join(home, ".config", "goose", "config.yaml");
    case "amp": {
      const json = path.join(home, ".config", "amp", "settings.json");
      const jsonc = path.join(home, ".config", "amp", "settings.jsonc");
      return hasContent(json) || !hasContent(jsonc) ? json : jsonc;
    }
  }
}

/** Which clients this machine has: their config directory (or binary) exists. */
export function detectClients(home = os.homedir()): Record<ConnectClient, boolean> {
  return {
    "claude-code": fs.existsSync(path.join(home, ".claude.json")) || fs.existsSync(path.join(home, ".claude")) || Boolean(onPath("claude")),
    opencode: fs.existsSync(path.join(home, ".config", "opencode")) || Boolean(onPath("opencode")),
    codex: fs.existsSync(path.join(home, ".codex")) || Boolean(onPath("codex")),
    cursor: fs.existsSync(path.join(home, ".cursor")) || Boolean(onPath("cursor")),
    "claude-desktop": fs.existsSync(claudeDesktopDir(home)),
    "oh-my-pi": fs.existsSync(path.join(home, ".omp")) || Boolean(onPath("omp")),
    "gemini-cli": fs.existsSync(path.join(home, ".gemini")) || Boolean(onPath("gemini")),
    "qwen-code": fs.existsSync(path.join(home, ".qwen")) || Boolean(onPath("qwen")),
    "kimi-cli": fs.existsSync(path.join(home, ".kimi")) || Boolean(onPath("kimi")),
    goose: fs.existsSync(path.dirname(clientFile("goose", home))) || Boolean(onPath("goose")),
    amp: fs.existsSync(path.join(home, ".config", "amp")) || Boolean(onPath("amp")),
  };
}

function normalizeClients(values: readonly string[]): ConnectClient[] {
  const names = new Set(
    values
      .flatMap((value) => value.split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  );
  for (const name of names) {
    if (!CONNECT_CLIENTS.includes(name as ConnectClient)) {
      throw new Error(`unknown client "${name}" (use ${CONNECT_CLIENTS.join(", ")})`);
    }
  }
  return CONNECT_CLIENTS.filter((client) => names.has(client));
}

/** Display a path relative to the home directory, so the table stays readable. */
export function displayPath(file: string, home = os.homedir()): string {
  const relative = path.relative(home, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return file;
  return `~/${relative.split(path.sep).join("/")}`;
}

/** What a client's `basics` entry says, whichever format it is written in. */
interface EntryInfo {
  transport: ConnectTransport;
  /** Present for the http transport. */
  url?: string;
  /** command + args, present for the stdio transport. */
  argv: string[];
}

function stringList(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

/** Normalise a config entry (`{command, args}`, opencode's `{command: [...]}` or `{url}`). */
function entryInfo(value: unknown): EntryInfo | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entry = value as Record<string, unknown>;
  if (typeof entry.httpUrl === "string") return { transport: "http", url: entry.httpUrl, argv: [] };
  if (typeof entry.uri === "string") return { transport: "http", url: entry.uri, argv: [] };
  if (typeof entry.url === "string") return { transport: "http", url: entry.url, argv: [] };
  const argv = [...stringList(entry.command ?? entry.cmd), ...stringList(entry.args)];
  return argv.length ? { transport: "stdio", argv } : undefined;
}

/** Case-insensitive on Windows, where the same vault can be spelled with any drive-letter case. */
function samePath(a: string, b: string): boolean {
  const normalize = (value: string) => {
    const resolved = path.resolve(value);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(a) === normalize(b);
}

function pointsAtVault(info: EntryInfo, vault: string): boolean {
  if (info.transport === "http") return LOCAL_MCP_URL.test(info.url ?? "");
  return info.argv.some((arg) => samePath(arg, vault));
}

/** String literals of one `command =` / `args =` line of the codex TOML file. */
function tomlStrings(value: string): string[] {
  const found: string[] = [];
  for (const match of value.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    try {
      found.push(JSON.parse(`"${match[1]}"`) as string);
    } catch {
      found.push(match[1].replace(/\\(.)/g, "$1"));
    }
  }
  return found;
}

/** The `[mcp_servers.basics]` section of a codex `config.toml`, as an entry. */
function readTomlEntry(file: string): EntryInfo | undefined {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const index = lines.findIndex((line) => line.trim() === TOML_HEADER);
  if (index === -1) return undefined;
  let end = lines.length;
  for (let i = index + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) {
      end = i;
      break;
    }
  }
  const argv: string[] = [];
  for (const line of lines.slice(index + 1, end)) {
    const match = /^\s*(?:command|args)\s*=\s*(.+)$/.exec(line);
    if (match) argv.push(...tomlStrings(match[1]));
  }
  return argv.length ? { transport: "stdio", argv } : undefined;
}

/** The `basics` entry of one client, or `undefined` when the file is missing, unreadable or has none. */
function readClientEntry(client: ConnectClient, file: string): EntryInfo | undefined {
  if (!fs.existsSync(file)) return undefined;
  try {
    if (client === "codex") return readTomlEntry(file);
    if (client === "goose") {
      const value = gooseEntry(file);
      if (value && typeof value === "object" && "enabled" in value && value.enabled === false) return undefined;
      return entryInfo(value);
    }
    const text = fs.readFileSync(file, "utf8");
    const root = JSON_PRESETS.has(client) ? readPresetJson(text) : JSON.parse(text);
    if (client === "oh-my-pi" && Array.isArray(root.disabledServers) && root.disabledServers.includes("basics")) return undefined;
    let cursor: unknown = root;
    for (const key of keyPathFor(client)) {
      if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
      cursor = (cursor as Record<string, unknown>)[key];
    }
    if (JSON_PRESETS.has(client) && cursor && typeof cursor === "object" && "enabled" in cursor && cursor.enabled === false)
      return undefined;
    return entryInfo(cursor);
  } catch {
    // Unparseable config: treat as not connected rather than failing the whole list.
    return undefined;
  }
}

function skillInstalled(client: ConnectClient, home: string): boolean | null {
  const dir = SKILL_DIRS[client]?.(home);
  if (!dir) return null;
  return fs.existsSync(path.join(dir, "SKILL.md"));
}

/**
 * Where every client stands: installed on this machine, already pointed at this vault, and
 * whether the Basics skill is copied in. Read-only; nothing is written.
 */
export function connectStatus(opts: ConnectStatusOptions): ConnectStatusResult {
  const home = opts.home ?? os.homedir();
  const vault = path.resolve(opts.vault);
  const detected = detectClients(home);
  const clients = CONNECT_CLIENTS.map((client): ConnectStatusEntry => {
    const file = clientFile(client, home);
    const info = readClientEntry(client, file);
    const connected = info ? pointsAtVault(info, vault) : false;
    return {
      client,
      detected: detected[client],
      connected,
      ...(connected && info ? { transport: info.transport } : {}),
      skill: skillInstalled(client, home),
      configPath: displayPath(file, home),
    };
  });
  return { vault, clients, snippets: connectSnippets(vault, opts.url) };
}

function desiredEntry(client: ConnectClient, command: string[], url: string | undefined): Record<string, unknown> {
  if (client === "goose")
    return url
      ? { type: "streamable_http", name: "basics", enabled: true, uri: url, timeout: 300 }
      : { type: "stdio", name: "basics", enabled: true, cmd: command[0], args: command.slice(1), envs: {}, timeout: 300 };
  if (client === "opencode") {
    return url ? { type: "remote", url, enabled: true } : { type: "local", command, enabled: true };
  }
  if (url) {
    if (client === "gemini-cli" || client === "qwen-code") return { httpUrl: url };
    if (client === "amp" || client === "kimi-cli") return { url };
    return client === "cursor" || client === "claude-desktop" ? { url } : { type: "http", url };
  }
  return { command: command[0], args: command.slice(1) };
}

function keyPathFor(client: ConnectClient): string[] {
  if (client === "opencode") return ["mcp", "basics"];
  if (client === "amp") return ["amp.mcpServers", "basics"];
  return ["mcpServers", "basics"];
}

function nested(keyPath: string[], value: unknown): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  let cursor = root;
  for (const key of keyPath.slice(0, -1)) {
    const child: Record<string, unknown> = {};
    cursor[key] = child;
    cursor = child;
  }
  cursor[keyPath[keyPath.length - 1]] = value;
  return root;
}

function editJson(file: string, keyPath: string[], value: unknown): FileEdit {
  const exists = fs.existsSync(file);
  const before = exists ? fs.readFileSync(file, "utf8") : null;
  let root: Record<string, unknown> = {};
  if (before?.trim()) {
    try {
      const parsed: unknown = JSON.parse(before);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected a JSON object");
      root = parsed as Record<string, unknown>;
    } catch (err) {
      return {
        file,
        before,
        after: before,
        changed: false,
        existed: false,
        parseError: err instanceof Error ? err.message : String(err),
      };
    }
  }

  let cursor: Record<string, unknown> = root;
  for (const key of keyPath.slice(0, -1)) {
    const next = cursor[key];
    if (next === undefined) {
      const child: Record<string, unknown> = {};
      cursor[key] = child;
      cursor = child;
      continue;
    }
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return {
        file,
        before,
        after: before ?? "",
        changed: false,
        existed: false,
        parseError: `"${key}" is not an object`,
      };
    }
    cursor = next as Record<string, unknown>;
  }

  const last = keyPath[keyPath.length - 1];
  const current = cursor[last];
  const existed = current !== undefined;
  if (existed && JSON.stringify(current) === JSON.stringify(value)) {
    return { file, before, after: before ?? "", changed: false, existed: true };
  }
  cursor[last] = value;
  return { file, before, after: `${JSON.stringify(root, null, 2)}\n`, changed: true, existed };
}

function tomlString(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

const TOML_HEADER = "[mcp_servers.basics]";

function editToml(file: string, command: string[]): FileEdit {
  const exists = fs.existsSync(file);
  const before = exists ? fs.readFileSync(file, "utf8") : null;
  const text = before ?? "";
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text ? text.split(/\r?\n/) : [];
  if (lines.length && lines[lines.length - 1] === "") lines.pop();

  const desiredCommand = `command = ${tomlString(command[0])}`;
  const desiredArgs = `args = [${command.slice(1).map(tomlString).join(", ")}]`;
  const index = lines.findIndex((line) => line.trim() === TOML_HEADER);

  if (index === -1) {
    const next = [...lines];
    if (next.length && next[next.length - 1].trim() !== "") next.push("");
    next.push(TOML_HEADER, desiredCommand, desiredArgs);
    return { file, before, after: next.join(nl) + nl, changed: true, existed: false };
  }

  let end = lines.length;
  for (let i = index + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      end = i;
      break;
    }
  }

  const body = lines.slice(index + 1, end);
  if (body.some((line) => line.trim() === desiredCommand) && body.some((line) => line.trim() === desiredArgs)) {
    return { file, before, after: text, changed: false, existed: true };
  }

  const replaced = body.map((line) => (/^\s*command\s*=/.test(line) ? desiredCommand : /^\s*args\s*=/.test(line) ? desiredArgs : line));
  if (!body.some((line) => /^\s*command\s*=/.test(line))) replaced.push(desiredCommand);
  if (!body.some((line) => /^\s*args\s*=/.test(line))) replaced.push(desiredArgs);

  const next = [...lines.slice(0, index + 1), ...replaced, ...lines.slice(end)];
  return { file, before, after: next.join(nl) + nl, changed: true, existed: true };
}

/** Line-level diff: shared prefix and suffix stay out, the rest is shown as -/+. */
export function diffText(before: string | null, after: string): string {
  const a = (before ?? "").split(/\r?\n/);
  const b = after.split(/\r?\n/);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const lines = [...a.slice(start, endA).map((line) => `- ${line}`), ...b.slice(start, endB).map((line) => `+ ${line}`)];
  return lines.join("\n");
}

function backupOnce(file: string): void {
  const backup = `${file}.basics-backup`;
  if (!fs.existsSync(file) || fs.existsSync(backup)) return;
  fs.copyFileSync(file, backup);
}

function applyJson(edit: FileEdit, keyPath: string[], value: unknown, dryRun: boolean): Pick<ConnectEntry, "result" | "message" | "diff"> {
  if (edit.parseError) {
    const snippet = JSON.stringify(nested(keyPath, value), null, 2);
    return {
      result: "manual",
      message: `cannot parse ${displayPath(edit.file)} (${edit.parseError}); left untouched. Paste this into the file:\n${snippet}`,
    };
  }
  if (!edit.changed) return { result: "unchanged" };
  if (dryRun) return { result: "dry-run", diff: diffText(edit.before, edit.after) };
  backupOnce(edit.file);
  atomicWrite(edit.file, edit.after);
  return { result: edit.existed ? "updated" : "registered" };
}

function changeLabel(edit: FileEdit, keyPath: string[], transport: ConnectTransport, url?: string): string {
  const what = keyPath.join(".");
  const entry = transport === "http" ? `${what} (http ${url})` : `${what} (stdio)`;
  if (edit.parseError) return `paste ${entry} by hand`;
  return edit.existed ? `replace ${entry}` : `add ${entry}`;
}

interface ClaudeCliResult {
  ok: boolean;
  output: string;
}

function runClaude(args: string[]): ClaudeCliResult {
  if (process.env.BASICS_CONNECT_NO_CLI === "1") return { ok: false, output: "claude CLI disabled" };
  const exe = onPath("claude");
  if (!exe) return { ok: false, output: "claude not on PATH" };
  const quote = (value: string) => `"${value.replace(/"/g, '\\"')}"`;
  const line = [exe, ...args].map(quote).join(" ");
  const result = spawnSync(line, { shell: true, encoding: "utf8", timeout: 30_000 });
  return { ok: result.status === 0, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim() };
}

function registerClaudeCode(
  home: string,
  command: string[],
  url: string | undefined,
  transport: ConnectTransport,
  dryRun: boolean,
): Pick<ConnectEntry, "target" | "change" | "result" | "message" | "diff"> {
  const file = clientFile("claude-code", home);
  const keyPath = keyPathFor("claude-code");
  const value = desiredEntry("claude-code", command, url);
  const edit = editJson(file, keyPath, value);
  const target = displayPath(file, home);
  const change = changeLabel(edit, keyPath, transport, url);
  if (edit.parseError) return { target, change, ...applyJson(edit, keyPath, value, dryRun) };
  if (!edit.changed) return { target, change: "none", ...applyJson(edit, keyPath, value, dryRun) };
  if (dryRun) return { target, change, ...applyJson(edit, keyPath, value, dryRun) };

  if (onPath("claude") && process.env.BASICS_CONNECT_NO_CLI !== "1") {
    if (edit.existed) runClaude(["mcp", "remove", "--scope", "user", "basics"]);
    const args =
      transport === "http"
        ? ["mcp", "add", "--scope", "user", "--transport", "http", "basics", url ?? ""]
        : ["mcp", "add", "--scope", "user", "basics", "--", ...command];
    const cli = runClaude(args);
    if (cli.ok) {
      return {
        target,
        change,
        result: edit.existed ? "updated" : "registered",
        message: "via `claude mcp add --scope user`",
      };
    }
  }

  return { target, change, ...applyJson(edit, keyPath, value, dryRun) };
}

function installSkill(
  client: ConnectClient,
  home: string,
  source: { path: string; text: string },
  dryRun: boolean,
): ConnectSkillResult | undefined {
  const dir = SKILL_DIRS[client]?.(home);
  if (!dir) return undefined;
  const file = path.join(dir, "SKILL.md");
  const display = displayPath(file, home);
  try {
    const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    if (current === source.text) return { path: display, result: "unchanged" };
    if (dryRun) return { path: display, result: "dry-run", diff: diffText(current, source.text) };
    atomicWrite(file, source.text);
    return { path: display, result: "copied" };
  } catch (err) {
    return { path: display, result: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

function register(
  client: ConnectClient,
  home: string,
  command: string[],
  url: string | undefined,
  transport: ConnectTransport,
  dryRun: boolean,
): Pick<ConnectEntry, "target" | "change" | "result" | "message" | "diff"> {
  if (client === "claude-code") return registerClaudeCode(home, command, url, transport, dryRun);

  const file = clientFile(client, home);
  const keyPath = keyPathFor(client);
  const target = displayPath(file, home);

  if (client === "goose") {
    const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    const value = desiredEntry(client, command, url);
    try {
      const existed = before ? Boolean(gooseEntry(file)) : false;
      const after = editGoose(before ?? "", value);
      if (after === before) return { target, change: "none", result: "unchanged" };
      const diff = diffText(before, after);
      if (dryRun) return { target, change: "extensions.basics", result: "dry-run", diff };
      backupOnce(file);
      atomicWrite(file, after);
      return { target, change: "extensions.basics", result: existed ? "updated" : "registered" };
    } catch (err) {
      return {
        target,
        change: "none",
        result: "manual",
        message: `${String(err)}. Merge extensions.basics into ${target}`,
        diff: `extensions:\n  basics: ${JSON.stringify(value)}`,
      };
    }
  }

  if (client === "codex") {
    if (transport === "http") {
      return {
        target,
        change: "none",
        result: "skipped",
        message: "codex only supports stdio; rerun with --transport stdio to register it",
      };
    }
    const edit = editToml(file, command);
    const change = changeLabel(edit, ["mcp_servers", "basics"], transport);
    if (!edit.changed) return { target, change: "none", result: "unchanged" };
    if (dryRun) return { target, change, result: "dry-run", diff: diffText(edit.before, edit.after) };
    backupOnce(file);
    atomicWrite(file, edit.after);
    return { target, change, result: edit.existed ? "updated" : "registered" };
  }

  const value = desiredEntry(client, command, url);
  if (JSON_PRESETS.has(client)) {
    const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
    try {
      const root = before?.trim() ? readPresetJson(before) : {};
      const servers = root[keyPath[0]];
      const current = servers && typeof servers === "object" ? (servers as Record<string, unknown>).basics : undefined;
      let after = JSON.stringify(current) === JSON.stringify(value) ? (before ?? "") : patchPresetJson(before ?? "", keyPath, value);
      if (client === "oh-my-pi" && Array.isArray(root.disabledServers) && root.disabledServers.includes("basics")) {
        after = patchPresetJson(
          after,
          ["disabledServers"],
          root.disabledServers.filter((name) => name !== "basics"),
        );
      }
      if (after === before) return { target, change: "none", result: "unchanged" };
      const edit = { file, before, after, changed: true, existed: current !== undefined };
      return { target, change: keyPath.join("."), ...applyJson(edit, keyPath, value, dryRun) };
    } catch (err) {
      return {
        target,
        change: "none",
        ...applyJson(
          { file, before, after: before ?? "", changed: false, existed: false, parseError: String(err) },
          keyPath,
          value,
          dryRun,
        ),
      };
    }
  }
  const edit = editJson(file, keyPath, value);
  const change = changeLabel(edit, keyPath, transport, url);
  if (!edit.changed && !edit.parseError) return { target, change: "none", result: "unchanged" };
  return { target, change, ...applyJson(edit, keyPath, value, dryRun) };
}

/** Register the Basics MCP server (and skill) with each client. Writes nothing when `dryRun`. */
export function connect(opts: ConnectOptions): ConnectResult {
  const home = os.homedir();
  const transport: ConnectTransport = opts.transport ?? "stdio";
  const port = opts.port ?? 4747;
  const dryRun = opts.dryRun ?? false;
  const command = connectCommand(opts.vault);
  const url = transport === "http" ? `http://127.0.0.1:${port}/mcp` : undefined;
  const detected = detectClients(home);
  const explicit = Boolean(opts.clients?.length);
  const selected = explicit ? normalizeClients(opts.clients ?? []) : [...CONNECT_CLIENTS];

  let source: { path: string; text: string } | undefined;
  let skillError: string | undefined;
  if (opts.skill !== false) {
    try {
      const sourcePath = skillSourcePath();
      source = { path: sourcePath, text: fs.readFileSync(sourcePath, "utf8") };
    } catch (err) {
      skillError = err instanceof Error ? err.message : String(err);
    }
  }

  const entries: ConnectEntry[] = [];
  for (const client of selected) {
    const isDetected = detected[client];
    if (!explicit && !isDetected) {
      entries.push({
        client,
        detected: false,
        target: displayPath(clientFile(client, home), home),
        change: "not detected",
        result: "skipped",
      });
      continue;
    }

    let outcome: Pick<ConnectEntry, "target" | "change" | "result" | "message" | "diff">;
    try {
      outcome = register(client, home, command, url, transport, dryRun);
    } catch (err) {
      outcome = {
        target: displayPath(clientFile(client, home), home),
        change: "none",
        result: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    const entry: ConnectEntry = { client, detected: isDetected, ...outcome };
    if (source && outcome.result !== "skipped") entry.skill = installSkill(client, home, source, dryRun);
    entries.push(entry);
  }

  return { vault: path.resolve(opts.vault), transport, url, command, entries, skillError };
}

interface RemoveEdit {
  file: string;
  before: string | null;
  /** New file contents; `null` means the file only held the Basics entry and is deleted. */
  after: string | null;
  changed: boolean;
  absent: boolean;
  parseError?: string;
}

/** Drop a nested `basics` key, keeping every other key and byte of the file. */
function removeJsonEntry(file: string, keyPath: string[]): RemoveEdit {
  if (!fs.existsSync(file)) return { file, before: null, after: null, changed: false, absent: true };
  const before = fs.readFileSync(file, "utf8");
  let root: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(before);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("expected a JSON object");
    root = parsed as Record<string, unknown>;
  } catch (err) {
    return {
      file,
      before,
      after: before,
      changed: false,
      absent: false,
      parseError: err instanceof Error ? err.message : String(err),
    };
  }

  let cursor: Record<string, unknown> = root;
  for (const key of keyPath.slice(0, -1)) {
    const next = cursor[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return { file, before, after: before, changed: false, absent: true };
    }
    cursor = next as Record<string, unknown>;
  }
  const last = keyPath[keyPath.length - 1];
  if (!(last in cursor)) return { file, before, after: before, changed: false, absent: true };
  delete cursor[last];

  // `basics connect` may have created the file: when nothing but empty wrappers is left, delete it.
  const emptyRoot = Object.values(root).every(isEmptyObject);
  const after = emptyRoot ? null : `${JSON.stringify(root, null, 2)}\n`;
  return { file, before, after, changed: true, absent: false };
}

function isEmptyObject(value: unknown): boolean {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.keys(value as object).length === 0;
}

/** Drop the whole `[mcp_servers.basics]` section from a codex `config.toml`. */
function removeTomlEntry(file: string): RemoveEdit {
  if (!fs.existsSync(file)) return { file, before: null, after: null, changed: false, absent: true };
  const before = fs.readFileSync(file, "utf8");
  const nl = before.includes("\r\n") ? "\r\n" : "\n";
  const lines = before.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();

  const index = lines.findIndex((line) => line.trim() === TOML_HEADER);
  if (index === -1) return { file, before, after: before, changed: false, absent: true };

  let end = lines.length;
  for (let i = index + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) {
      end = i;
      break;
    }
  }
  // Take the blank line that separated the section from the one before it, so no gap is left behind.
  const start = index > 0 && lines[index - 1].trim() === "" ? index - 1 : index;
  const next = [...lines.slice(0, start), ...lines.slice(end)];
  while (next.length && next[next.length - 1].trim() === "") next.pop();
  const after = next.length ? `${next.join(nl)}${nl}` : null;
  return { file, before, after, changed: true, absent: false };
}

function applyRemove(
  edit: RemoveEdit,
  keyPath: string[],
  home: string,
  dryRun: boolean,
): Pick<DisconnectEntry, "result" | "message" | "diff"> {
  const target = displayPath(edit.file, home);
  if (edit.parseError) {
    return {
      result: "manual",
      message: `cannot parse ${target} (${edit.parseError}); remove the "${keyPath.join(".")}" entry by hand`,
    };
  }
  if (edit.absent) return { result: "absent" };
  const diff = diffText(edit.before, edit.after ?? "");
  if (dryRun) return { result: "dry-run", diff };
  if (edit.after === null) fs.rmSync(edit.file, { force: true });
  else atomicWrite(edit.file, edit.after);
  return { result: "removed", diff };
}

function removeSkill(client: ConnectClient, home: string, dryRun: boolean): DisconnectSkillResult | undefined {
  const dir = SKILL_DIRS[client]?.(home);
  if (!dir) return undefined;
  const file = path.join(dir, "SKILL.md");
  const display = displayPath(file, home);
  try {
    if (!fs.existsSync(file)) return { path: display, result: "absent" };
    if (dryRun) return { path: display, result: "dry-run" };
    fs.rmSync(file);
    // Remove the `basics` skill folder too when the skill was its only content.
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    return { path: display, result: "removed" };
  } catch (err) {
    return { path: display, result: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

function unregister(
  client: ConnectClient,
  home: string,
  dryRun: boolean,
  allowCli: boolean,
): Pick<DisconnectEntry, "target" | "change" | "result" | "message" | "diff"> {
  const file = clientFile(client, home);
  const keyPath = keyPathFor(client);
  const target = displayPath(file, home);

  if (JSON_PRESETS.has(client)) {
    try {
      if (!fs.existsSync(file)) return { target, change: "none", result: "absent" };
      const before = fs.readFileSync(file, "utf8");
      const after = patchPresetJson(before, keyPath);
      const edit = { file, before, after, changed: before !== after, absent: before === after };
      return { target, change: before === after ? "none" : `remove ${keyPath.join(".")}`, ...applyRemove(edit, keyPath, home, dryRun) };
    } catch (err) {
      return { target, change: "none", result: "manual", message: `${String(err)}. Remove only ${keyPath.join(".")} from ${target}` };
    }
  }

  if (client === "goose") {
    try {
      if (!fs.existsSync(file) || !gooseEntry(file)) return { target, change: "none", result: "absent" };
      const before = fs.readFileSync(file, "utf8");
      const after = editGoose(before);
      return {
        target,
        change: "remove extensions.basics",
        ...applyRemove({ file, before, after, changed: before !== after, absent: false }, ["extensions", "basics"], home, dryRun),
      };
    } catch (err) {
      return { target, change: "none", result: "manual", message: `${String(err)}. Remove only extensions.basics from ${target}` };
    }
  }

  if (client === "claude-code" && allowCli && onPath("claude") && process.env.BASICS_CONNECT_NO_CLI !== "1") {
    if (dryRun) {
      const edit = removeJsonEntry(file, keyPath);
      return { target, change: `remove ${keyPath.join(".")}`, ...applyRemove(edit, keyPath, home, true) };
    }
    const cli = runClaude(["mcp", "remove", "--scope", "user", "basics"]);
    // The CLI also leaves `~/.claude.json` alone when the entry never existed, so fall through then.
    if (cli.ok)
      return {
        target,
        change: `remove ${keyPath.join(".")}`,
        result: "removed",
        message: "via `claude mcp remove --scope user`",
      };
  }

  const edit = client === "codex" ? removeTomlEntry(file) : removeJsonEntry(file, keyPath);
  const change = edit.absent ? "none" : `remove ${keyPath.join(".")}`;
  return { target, change, ...applyRemove(edit, keyPath, home, dryRun) };
}

/**
 * Remove the Basics MCP entry (and skill) from each client, touching nothing else in their
 * config files. Matches `basics connect`: no client list means every client, no writing with
 * `dryRun`.
 */
export function disconnect(opts: DisconnectOptions = {}): DisconnectResult {
  const home = opts.home ?? os.homedir();
  const dryRun = opts.dryRun ?? false;
  // The claude CLI always edits the real user config, so only reach for it when home is the real one.
  const allowCli = !opts.home || samePath(opts.home, os.homedir());
  const detected = detectClients(home);
  const selected = opts.clients?.length ? normalizeClients(opts.clients) : [...CONNECT_CLIENTS];

  const entries: DisconnectEntry[] = [];
  for (const client of selected) {
    let outcome: Pick<DisconnectEntry, "target" | "change" | "result" | "message" | "diff">;
    try {
      outcome = unregister(client, home, dryRun, allowCli);
    } catch (err) {
      outcome = {
        target: displayPath(clientFile(client, home), home),
        change: "none",
        result: "error",
        message: err instanceof Error ? err.message : String(err),
      };
    }

    const entry: DisconnectEntry = { client, detected: detected[client], ...outcome };
    if (opts.skill !== false) entry.skill = removeSkill(client, home, dryRun);
    entries.push(entry);
  }

  return { entries };
}
