import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { atomicWrite } from "@marcozvd/basics-core";

export const CONNECT_CLIENTS = ["claude-code", "opencode", "codex", "cursor", "claude-desktop"] as const;
export type ConnectClient = (typeof CONNECT_CLIENTS)[number];
export type ConnectTransport = "stdio" | "http";
export type ConnectOutcome = "registered" | "updated" | "unchanged" | "skipped" | "dry-run" | "manual" | "error";

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
};

const SERVER_RELATIVE = path.join("dist", "mcp", "server.js");

function packageRoot(): string {
  return path.resolve(import.meta.dirname, "..");
}

/** argv every stdio client gets: the current Node, this package's server, the vault. */
export function connectCommand(vault: string): string[] {
  const node = process.env.BASICS_CONNECT_NODE || process.execPath;
  const server = process.env.BASICS_CONNECT_SERVER || path.join(packageRoot(), SERVER_RELATIVE);
  return [node, server, path.resolve(vault)];
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
  }
}

function onPath(bin: string): string | undefined {
  const pathEnv = process.env.PATH ?? "";
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

/** Which clients this machine has: their config directory (or binary) exists. */
export function detectClients(home = os.homedir()): Record<ConnectClient, boolean> {
  return {
    "claude-code": fs.existsSync(path.join(home, ".claude.json")) || fs.existsSync(path.join(home, ".claude")) || Boolean(onPath("claude")),
    opencode: fs.existsSync(path.join(home, ".config", "opencode")) || Boolean(onPath("opencode")),
    codex: fs.existsSync(path.join(home, ".codex")) || Boolean(onPath("codex")),
    cursor: fs.existsSync(path.join(home, ".cursor")) || Boolean(onPath("cursor")),
    "claude-desktop": fs.existsSync(claudeDesktopDir(home)),
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

function desiredEntry(client: ConnectClient, command: string[], url: string | undefined): Record<string, unknown> {
  if (client === "opencode") {
    return url ? { type: "remote", url, enabled: true } : { type: "local", command, enabled: true };
  }
  if (url) {
    return client === "cursor" || client === "claude-desktop" ? { url } : { type: "http", url };
  }
  return { command: command[0], args: command.slice(1) };
}

function keyPathFor(client: ConnectClient): string[] {
  if (client === "opencode") return ["mcp", "basics"];
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
