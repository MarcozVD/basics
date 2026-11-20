import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentId, CompareCondition } from "@marcozvd/basics-core";
import { renderExport, type Vault } from "@marcozvd/basics-core";
import { connectSnippets } from "./connect.js";

export function prepareCompareEnvironment(
  root: string,
  agent: AgentId,
  vault: Vault,
  stack: string[],
  condition: CompareCondition,
  inherited = process.env,
  authHome?: string,
  protectedPaths: string[] = [],
) {
  const withBasics = condition === "basics";
  const sourceHome = authHome ?? os.homedir();
  const project = path.join(root, "project"),
    control = path.join(root, "control"),
    home = path.join(control, "home");
  fs.mkdirSync(project);
  fs.mkdirSync(home, { recursive: true });
  const env = {
    ...inherited,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData/Roaming"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local/share"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    XDG_STATE_HOME: path.join(home, ".local/state"),
    CODEX_HOME: path.join(home, ".codex"),
    CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
    BASICS_CONFIG: path.join(control, "basics-config.json"),
    BASICS_CACHE: path.join(control, "basics-cache"),
    BASICS_DIR: undefined,
  };
  // Remove runner-owned location hints, including npm's INIT_CWD and script
  // variables. This is accidental-exposure prevention, not a filesystem sandbox.
  const forbidden = protectedPaths.map((p) => path.resolve(p).replaceAll("\\", "/").toLowerCase());
  for (const [key, value] of Object.entries(env)) {
    if (typeof value !== "string") continue;
    const normalized = value.replaceAll("\\", "/").toLowerCase();
    if (forbidden.some((p) => normalized.includes(p))) delete (env as NodeJS.ProcessEnv)[key];
  }
  fs.writeFileSync(env.BASICS_CONFIG, JSON.stringify({ embeddings: false }));
  // Copy only credential stores, never user MCP/skills/settings; remove control even with --keep.
  const copyAuth = (source: string, target: string) => {
    if (!fs.existsSync(source) || fs.lstatSync(source).isSymbolicLink() || !fs.lstatSync(source).isFile()) return;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    fs.chmodSync(target, 0o600);
  };
  if (agent === "claude")
    copyAuth(
      path.join((!authHome && inherited.CLAUDE_CONFIG_DIR) || path.join(sourceHome, ".claude"), ".credentials.json"),
      path.join(env.CLAUDE_CONFIG_DIR, ".credentials.json"),
    );
  if (agent === "codex")
    copyAuth(
      path.join((!authHome && inherited.CODEX_HOME) || path.join(sourceHome, ".codex"), "auth.json"),
      path.join(env.CODEX_HOME, "auth.json"),
    );
  if (agent === "opencode")
    copyAuth(
      path.join((!authHome && inherited.XDG_DATA_HOME) || path.join(sourceHome, ".local/share"), "opencode/auth.json"),
      path.join(env.XDG_DATA_HOME, "opencode/auth.json"),
    );
  const snippets = connectSnippets(vault.root);
  const entry = JSON.parse(snippets.json).mcpServers.basics as { command: string; args: string[] };
  entry.args.push("--read-only");
  const mcpFile = path.join(control, "mcp.json");
  fs.writeFileSync(mcpFile, JSON.stringify({ mcpServers: withBasics ? { basics: entry } : {} }));
  const codeConfig = path.join(control, "opencode.json");
  fs.writeFileSync(
    codeConfig,
    JSON.stringify({
      permission: "allow",
      mcp: withBasics ? { basics: { type: "local", command: [entry.command, ...entry.args], enabled: true } } : {},
    }),
  );
  Object.assign(env, { OPENCODE_CONFIG: codeConfig, OPENCODE_CONFIG_CONTENT: "{}", OPENCODE_PERMISSION: JSON.stringify({ "*": "allow" }) });
  fs.mkdirSync(env.CODEX_HOME, { recursive: true });
  const codex = withBasics ? `${snippets.toml.replace(/\]\s*$/, ', "--read-only"]')}\n` : "";
  fs.writeFileSync(path.join(env.CODEX_HOME, "config.toml"), codex);
  if (condition !== "none")
    for (const file of renderExport(vault, stack, ["agents", "claude", "cursor"], () => null)) {
      const dest = path.join(project, file.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content);
    }
  return { project, control, env, args: agent === "claude" ? ["--mcp-config", mcpFile, "--setting-sources", "project"] : [] };
}
