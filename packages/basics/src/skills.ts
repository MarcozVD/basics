import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Config, loadConfig, parseFrontmatter } from "@marcozvd/basics-core";
import { displayPath } from "./connect.js";

/**
 * Read-only inventory of the agent skills installed for this user: which folders hold a
 * `SKILL.md`, which agent installed each one, and what area it belongs to. Nothing here writes
 * a skill file; the only writing (`PUT`/`DELETE /api/skills/:key/area`) edits the Basics config.
 */

export const SKILL_AREAS = ["frontend", "backend", "security", "testing", "devops", "data", "ai", "docs", "workflow", "other"] as const;
export type SkillArea = (typeof SKILL_AREAS)[number];

export const SKILL_AGENTS = ["claude-code", "opencode", "codex", "shared"] as const;
export type SkillAgent = (typeof SKILL_AGENTS)[number];

const AGENT_NAMES: Record<SkillAgent, string> = {
  "claude-code": "Claude Code",
  opencode: "opencode",
  codex: "Codex",
  shared: "Shared (opencode, Codex)",
};

/** Human labels for the CLI; the UI translates the same ids itself. */
export const SKILL_AREA_LABELS: Record<SkillArea, string> = {
  frontend: "Frontend",
  backend: "Backend",
  security: "Security",
  testing: "Testing",
  devops: "DevOps",
  data: "Data",
  ai: "AI & agents",
  docs: "Docs & writing",
  workflow: "Workflow",
  other: "Other",
};

export type SkillAreaSource = "frontmatter" | "keywords" | "override" | "none";

export interface SkillEntry {
  /** Stable, URL-safe id used by the area override; not a path. */
  key: string;
  name: string;
  /** Frontmatter description, else the first paragraph of the file. */
  description: string;
  /** Short version of `description` for the collapsed row. */
  summary: string;
  area: SkillArea;
  areaSource: SkillAreaSource;
  /** Every agent that has this skill, including when the same skill is installed several times. */
  agents: SkillAgent[];
  /** Plugin name when the skill ships inside a Claude Code plugin. */
  plugin?: string;
  /** `~/`-shortened path of the `SKILL.md`. */
  path: string;
  version?: string;
  /** Why this row could not be read; the row is still listed. */
  error?: string;
}

export interface SkillAgentInfo {
  id: SkillAgent;
  name: string;
  /** The agent is installed on this machine. */
  detected: boolean;
  /** Folders scanned for this agent, `~/`-shortened. */
  dirs: string[];
}

export interface SkillsResponse {
  agents: SkillAgentInfo[];
  skills: SkillEntry[];
}

export interface ScanSkillsOptions {
  home?: string;
  config?: Config;
}

/** Hard caps that keep a hostile or huge home directory from stalling the request. */
export const MAX_SKILLS = 500;
export const MAX_SKILL_BYTES = 256 * 1024;

interface AreaAlias {
  area: SkillArea;
  /** Extra words that mean the same area, compared as whole tokens. */
  words: string[];
}

/**
 * Frontmatter `category` (or first `tags` item) aliases. Kept small and explicit: a tag that is
 * not here falls through to the keyword table instead of guessing.
 */
const AREA_ALIASES: AreaAlias[] = [
  { area: "frontend", words: ["frontend", "front-end", "ui", "ux", "design", "css", "styling", "a11y", "accessibility", "react"] },
  { area: "backend", words: ["backend", "back-end", "api", "server", "server-side", "rest", "graphql", "http", "auth"] },
  { area: "security", words: ["security", "secure", "audit", "pentest", "owasp", "vulnerability", "appsec"] },
  { area: "testing", words: ["testing", "test", "tests", "qa", "e2e", "browser", "playwright", "jest", "vitest"] },
  { area: "devops", words: ["devops", "ci", "cd", "deploy", "deployment", "docker", "kubernetes", "k8s", "infra", "infrastructure"] },
  { area: "data", words: ["data", "database", "db", "sql", "analytics", "etl", "schema", "migration", "graph"] },
  { area: "ai", words: ["ai", "agents", "agent", "llm", "ml", "prompt", "mcp", "model"] },
  { area: "docs", words: ["docs", "documentation", "writing", "content", "legal", "blog", "media"] },
  { area: "workflow", words: ["workflow", "productivity", "process", "planning", "git", "commits", "meta"] },
];

/** Keyword weights over `name` + `description`. Higher wins; ties go to the earlier area. */
const KEYWORDS: Record<Exclude<SkillArea, "other">, [string, number][]> = {
  frontend: [
    ["frontend", 4],
    ["front end", 4],
    ["frontend-design", 4],
    ["design", 3],
    ["diseno", 3],
    ["ui", 3],
    ["ux", 3],
    ["interfaz", 3],
    ["interface", 3],
    ["css", 3],
    ["tailwind", 3],
    ["responsive", 2],
    ["accessibility", 2],
    ["accesibilidad", 2],
    ["animations", 3],
    ["animation", 3],
    ["animacion", 3],
    ["gsap", 4],
    ["landing page", 3],
    ["component", 2],
    ["typography", 2],
  ],
  backend: [
    ["backend", 4],
    ["back end", 4],
    ["api", 3],
    ["server", 2],
    ["servidor", 2],
    ["rest", 2],
    ["graphql", 3],
    ["endpoint", 3],
    ["microservice", 3],
    ["orm", 2],
    ["auth", 2],
    ["autenticacion", 2],
    ["node", 1],
    ["express", 2],
    ["fastapi", 2],
    ["django", 2],
  ],
  security: [
    ["security", 5],
    ["seguridad", 5],
    ["vulnerability", 4],
    ["vulnerabilidades", 4],
    ["vulnerabilities", 4],
    ["pen test", 4],
    ["pentest", 4],
    ["audit", 3],
    ["auditoria", 3],
    ["owasp", 4],
    ["threat", 3],
    ["exploit", 3],
    ["cve", 3],
    ["appsec", 4],
    ["secret", 2],
    ["trust boundary", 3],
  ],
  testing: [
    ["testing", 4],
    ["pruebas", 4],
    ["test", 3],
    ["tests", 3],
    ["testear", 3],
    ["qa", 3],
    ["e2e", 3],
    ["end to end", 2],
    ["playwright", 3],
    ["vitest", 3],
    ["jest", 3],
    ["cypress", 3],
    ["unit test", 3],
    ["regression", 2],
    ["browser automation", 3],
    ["verify", 2],
    ["validation", 2],
    ["validacion", 2],
  ],
  devops: [
    ["devops", 5],
    ["ci", 3],
    ["continuous integration", 4],
    ["cd", 2],
    ["deploy", 3],
    ["deployment", 3],
    ["despliegue", 3],
    ["docker", 4],
    ["kubernetes", 4],
    ["k8s", 4],
    ["infra", 3],
    ["infrastructure", 3],
    ["github actions", 4],
    ["pipeline", 2],
    ["terminal", 2],
    ["multiplexer", 3],
    ["limpieza", 3],
    ["limpiar", 2],
    ["build artifacts", 2],
    ["temporales", 2],
    ["observability", 3],
    ["monitoring", 2],
  ],
  data: [
    ["data", 3],
    ["datos", 3],
    ["database", 4],
    ["base de datos", 4],
    ["sql", 4],
    ["postgres", 3],
    ["sqlite", 3],
    ["analytics", 3],
    ["etl", 4],
    ["schema", 3],
    ["migration", 3],
    ["migracion", 3],
    ["knowledge graph", 4],
    ["graphrag", 4],
    ["knowledge graphs", 4],
    ["community detection", 3],
    ["dataset", 3],
    ["cost", 2],
    ["spend", 2],
    ["coste", 2],
  ],
  ai: [
    ["ai", 1],
    ["ia", 1],
    ["llm", 4],
    ["agents", 2],
    ["agent", 2],
    ["agente", 2],
    ["agentes", 2],
    ["mcp", 3],
    ["prompt", 2],
    ["model", 1],
    ["modelo", 1],
    ["openai", 2],
    ["anthropic", 2],
    ["token", 1],
    ["tokens", 1],
    ["embeddings", 3],
    ["rag", 3],
  ],
  docs: [
    ["docs", 3],
    ["documentation", 4],
    ["documentacion", 4],
    ["writing", 2],
    ["technical writing", 4],
    ["writer", 3],
    ["escritura", 3],
    ["copy", 2],
    ["content", 2],
    ["contenido", 2],
    ["legal", 5],
    ["contract", 4],
    ["contrato", 4],
    ["policy", 3],
    ["politica", 3],
    ["blog", 3],
    ["readme", 2],
    ["report", 2],
    ["informe", 2],
  ],
  workflow: [
    ["workflow", 4],
    ["flujo de trabajo", 4],
    ["workflows", 4],
    ["productivity", 4],
    ["productividad", 4],
    ["planning", 3],
    ["planificacion", 3],
    ["plan", 2],
    ["interview", 3],
    ["entrevista", 3],
    ["token usage", 4],
    ["token sink", 4],
    ["token sinks", 4],
    ["compress", 2],
    ["memory file", 2],
    ["optimization", 2],
    ["optimize", 2],
    ["decision", 2],
    ["decisiones", 2],
    ["tech stack", 4],
    ["stack", 2],
    ["vault", 3],
    ["project", 2],
    ["proyecto", 2],
    ["skills", 3],
    ["skill", 2],
    ["discover", 2],
    ["commit", 3],
    ["commits", 3],
    ["git", 3],
    ["review", 2],
    ["refactor", 3],
    ["bug", 3],
    ["bug fix", 6],
    ["fix bugs", 6],
    ["feature", 2],
    ["scope", 2],
    ["debug", 3],
    ["diagnose", 3],
    ["tokens", 1],
    ["compressed", 2],
    ["communication", 2],
    ["comunicacion", 2],
    ["nemesis", 2],
  ],
};

interface KeywordRule {
  area: SkillArea;
  pattern: RegExp;
  weight: number;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function keywordRule(area: SkillArea, phrase: string, weight: number): KeywordRule {
  const body = phrase.trim().split(/\s+/).map(escapeRegExp).join("[\\s-]+");
  return { area, pattern: new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`), weight };
}

const KEYWORD_RULES: KeywordRule[] = Object.entries(KEYWORDS).flatMap(([area, phrases]) =>
  phrases.map(([phrase, weight]) => keywordRule(area as SkillArea, phrase, weight)),
);

/** Lowercase and strip accents so `diseño` and `diseno` match the same keyword. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeAlias(value: string): string {
  return normalizeText(value)
    .trim()
    .replace(/[_\s]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** The area a `category`/tag value names, if the alias table knows it. */
function aliasArea(value: string): SkillArea | undefined {
  const normalized = normalizeAlias(value);
  if (!normalized) return undefined;
  for (const alias of AREA_ALIASES) {
    if (alias.words.some((word) => normalizeAlias(word) === normalized)) return alias.area;
  }
  // Tags such as `frontend-design` or `ai-agents`: any token the table knows.
  for (const token of normalized.split("-").filter(Boolean)) {
    for (const alias of AREA_ALIASES) {
      if (alias.words.some((word) => normalizeAlias(word) === token)) return alias.area;
    }
  }
  return undefined;
}

export interface ClassifyInput {
  name: string;
  description?: string;
  category?: string;
  tags?: readonly string[];
}

export interface ClassifyResult {
  area: SkillArea;
  source: Exclude<SkillAreaSource, "override">;
}

/** Deterministic, local classification: frontmatter alias first, then weighted keywords. */
export function classifySkill(input: ClassifyInput): ClassifyResult {
  const frontmatter = [input.category, ...(input.tags ?? [])].filter((value): value is string => Boolean(value?.trim()));
  for (const value of frontmatter) {
    const area = aliasArea(value);
    if (area) return { area, source: "frontmatter" };
  }

  const text = normalizeText(`${input.name} ${input.description ?? ""}`);
  const scores = new Map<SkillArea, number>();
  for (const rule of KEYWORD_RULES) {
    if (!rule.pattern.test(text)) continue;
    scores.set(rule.area, (scores.get(rule.area) ?? 0) + rule.weight);
  }
  let best: { area: SkillArea; score: number } | undefined;
  // SKILL_AREAS order makes equal scores resolve to the earlier area.
  for (const area of SKILL_AREAS) {
    const score = scores.get(area);
    if (score !== undefined && (!best || score > best.score)) best = { area, score };
  }
  return best ? { area: best.area, source: "keywords" } : { area: "other", source: "none" };
}

/** Area overrides kept in the Basics config, ignoring anything no longer valid. */
function overridesFor(config: Config | undefined): Record<string, SkillArea> {
  const raw = config?.skills?.areas ?? {};
  const areas: Record<string, SkillArea> = {};
  for (const [key, area] of Object.entries(raw)) {
    if (SKILL_AREAS.includes(area as SkillArea)) areas[key] = area as SkillArea;
  }
  return areas;
}

interface Frontmatter {
  name?: string;
  description?: string;
  version?: string;
  category?: string;
  tags: string[];
}

function frontmatterOf(data: Record<string, unknown>): Frontmatter {
  const text = (value: unknown): string | undefined => {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    return undefined;
  };
  const tags = Array.isArray(data.tags)
    ? data.tags.map((tag) => text(tag)).filter((tag): tag is string => Boolean(tag))
    : text(data.tags)
      ? [text(data.tags) as string]
      : [];
  return {
    name: text(data.name),
    description: text(data.description),
    version: text(data.version),
    category: text(data.category),
    tags,
  };
}

/** First paragraph after the frontmatter, skipping headings, lists and code fences. */
export function firstParagraph(body: string): string {
  const blocks = body.replace(/^\s+/, "").split(/\r?\n\s*\r?\n/);
  for (const block of blocks) {
    const lines = block.split(/\r?\n/).filter((line) => line.trim());
    if (!lines.length) continue;
    const first = lines[0].trim();
    if (/^(#{1,6}\s|[-*+]\s|\d+\.\s|```|>)/.test(first)) continue;
    return lines
      .map((line) => line.trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

function summarize(description: string): string {
  const text = description.replace(/\s+/g, " ").trim();
  if (text.length <= 180) return text;
  const sentence = /^(.{40,180}?[.!?])(\s|$)/.exec(text);
  if (sentence) return sentence[1];
  const cut = text.slice(0, 180);
  const space = cut.lastIndexOf(" ");
  return `${space > 100 ? cut.slice(0, space) : cut}…`;
}

function hash(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

function slugify(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

interface SkillRow {
  name: string;
  description: string;
  summary: string;
  version?: string;
  category?: string;
  tags: string[];
  agents: Set<SkillAgent>;
  plugin?: string;
  path: string;
  realPath: string;
  contentHash: string;
  error?: string;
}

interface SourceDir {
  agent: SkillAgent;
  dir: string;
  plugin?: string;
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function realPathOf(dir: string): string | undefined {
  try {
    return fs.realpathSync(dir);
  } catch {
    return undefined;
  }
}

/** Skill folders directly under `dir`: plain directories, symlinks and junctions. */
function skillDirs(dir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
    .map((entry) => path.join(dir, entry.name))
    .filter((full) => !path.basename(full).startsWith(".") && isDirectory(full))
    .sort((a, b) => a.localeCompare(b));
}

/** `installPath/skills` plus `.claude/skills`, the two layouts real plugins use. */
function pluginSkillDirs(installPath: string): string[] {
  return [path.join(installPath, "skills"), path.join(installPath, ".claude", "skills")].filter(isDirectory);
}

function pluginManifest(home: string): { sources: SourceDir[]; dirs: string[] } {
  const file = path.join(home, ".claude", "plugins", "installed_plugins.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return { sources: [], dirs: [] };
  }
  const plugins = (parsed as { plugins?: unknown })?.plugins;
  if (!plugins || typeof plugins !== "object" || Array.isArray(plugins)) return { sources: [], dirs: [] };

  const sources: SourceDir[] = [];
  const dirs: string[] = [];
  for (const [id, value] of Object.entries(plugins as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) {
    const entries = Array.isArray(value) ? value : [value];
    for (const entry of entries) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const record = entry as { scope?: unknown; installPath?: unknown };
      // Project-scoped plugins are not installed for the user: skip them.
      if (record.scope !== "user" || typeof record.installPath !== "string") continue;
      for (const dir of pluginSkillDirs(record.installPath)) {
        sources.push({ agent: "claude-code", dir, plugin: id.split("@")[0] || id });
        dirs.push(dir);
      }
    }
  }
  return { sources, dirs };
}

interface BuiltSourceDirs {
  sources: SourceDir[];
  dirs: Record<SkillAgent, string[]>;
  /** Agent config folder that marks the agent as installed, independent of PATH. */
  installed: Record<SkillAgent, boolean>;
}

function sourceDirs(home: string): BuiltSourceDirs {
  const base: Record<SkillAgent, string[]> = {
    "claude-code": [path.join(home, ".claude", "skills")],
    opencode: [path.join(home, ".config", "opencode", "skills"), path.join(home, ".config", "opencode", "skill")],
    codex: [path.join(home, ".codex", "skills")],
    shared: [path.join(home, ".agents", "skills")],
  };
  // Only folders, never PATH: a temp HOME must report the agents that own files in it, and
  // `detectClients` would find the owner's real binaries even for an empty test home.
  const configDir: Record<SkillAgent, string[]> = {
    "claude-code": [path.join(home, ".claude"), path.join(home, ".claude.json")],
    opencode: [path.join(home, ".config", "opencode")],
    codex: [path.join(home, ".codex")],
    shared: [path.join(home, ".agents")],
  };
  const sources: SourceDir[] = [];
  const dirs: Record<SkillAgent, string[]> = { "claude-code": [], opencode: [], codex: [], shared: [] };
  const installed: Record<SkillAgent, boolean> = { "claude-code": false, opencode: false, codex: false, shared: false };
  for (const agent of SKILL_AGENTS) {
    installed[agent] = configDir[agent].some((dir) => fs.existsSync(dir));
    for (const dir of base[agent]) {
      if (!isDirectory(dir)) continue;
      sources.push({ agent, dir });
      dirs[agent].push(dir);
      installed[agent] = true;
    }
  }
  const manifest = pluginManifest(home);
  sources.push(...manifest.sources);
  dirs["claude-code"].push(...manifest.dirs);
  if (manifest.sources.length) installed["claude-code"] = true;
  for (const agent of SKILL_AGENTS) {
    dirs[agent] = [...new Set(dirs[agent].map((dir) => displayPath(dir, home)))];
  }
  return { sources, dirs, installed };
}

interface ReadSkill {
  frontmatter: Frontmatter;
  description: string;
  text: string;
  error?: string;
}

/** Case-insensitive only where the file system is (Windows), so two `Skills` folders stay apart. */
function pathKey(value: string): string {
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function readSkillFile(file: string): ReadSkill | undefined {
  let size: number;
  try {
    size = fs.statSync(file).size;
  } catch {
    return undefined;
  }
  if (size > MAX_SKILL_BYTES) {
    const kb = Math.round(size / 1024);
    return { frontmatter: { tags: [] }, description: "", text: "", error: `SKILL.md is ${kb} KB (limit 256 KB)` };
  }
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (err) {
    return {
      frontmatter: { tags: [] },
      description: "",
      text: "",
      error: `could not read: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (Buffer.byteLength(text) > MAX_SKILL_BYTES) {
    return { frontmatter: { tags: [] }, description: "", text: "", error: "SKILL.md is too large to read" };
  }
  try {
    const { data, content } = parseFrontmatter(text);
    const frontmatter = frontmatterOf((data ?? {}) as Record<string, unknown>);
    const description = frontmatter.description || firstParagraph(content);
    const error = frontmatter.name || description ? undefined : "SKILL.md has no readable name or description";
    return { frontmatter, description, text, error };
  } catch (err) {
    return {
      frontmatter: { tags: [] },
      description: "",
      text: "",
      error: `could not read SKILL.md: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function addSkill(
  rows: SkillRow[],
  byPath: Map<string, SkillRow>,
  byContent: Map<string, SkillRow>,
  source: SourceDir,
  dir: string,
  home: string,
): void {
  if (rows.length >= MAX_SKILLS) return;
  const file = path.join(dir, "SKILL.md");
  const read = readSkillFile(file);
  if (!read) return;
  const realPath = realPathOf(dir) ?? dir;
  const folderName = path.basename(dir);
  const name = read.frontmatter.name || folderName;
  const contentHash = read.text ? hash(read.text) : "";
  const contentKey = contentHash ? `${name}\u0000${contentHash}` : "";

  const existing = byPath.get(pathKey(realPath)) ?? (contentKey ? byContent.get(contentKey) : undefined);
  if (existing) {
    existing.agents.add(source.agent);
    if (source.plugin && !existing.plugin) existing.plugin = source.plugin;
    if (!existing.error && read.error) existing.error = read.error;
    return;
  }

  const row: SkillRow = {
    name,
    description: read.description,
    summary: summarize(read.description),
    version: read.frontmatter.version,
    category: read.frontmatter.category,
    tags: read.frontmatter.tags,
    agents: new Set([source.agent]),
    path: displayPath(file, home),
    realPath,
    contentHash,
    ...(source.plugin ? { plugin: source.plugin } : {}),
    ...(read.error ? { error: read.error } : {}),
  };
  rows.push(row);
  byPath.set(pathKey(realPath), row);
  if (contentKey) byContent.set(contentKey, row);
}

function assignKeys(rows: SkillRow[]): string[] {
  const used = new Map<string, number>();
  return rows.map((row) => {
    const base = slugify(row.name) || "skill";
    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${hash(row.realPath).slice(0, 6)}`;
  });
}

/**
 * Scan every user-level skill folder for this machine. Read-only; a broken `SKILL.md` becomes a
 * row with `error` instead of failing the scan.
 */
export function scanSkills(opts: ScanSkillsOptions = {}): SkillsResponse {
  const home = opts.home ?? os.homedir();
  const config = opts.config ?? loadConfig();
  const overrides = overridesFor(config);
  const { sources, dirs, installed } = sourceDirs(home);

  const rows: SkillRow[] = [];
  const byPath = new Map<string, SkillRow>();
  const byContent = new Map<string, SkillRow>();
  for (const source of sources) {
    for (const dir of skillDirs(source.dir)) {
      if (rows.length >= MAX_SKILLS) break;
      addSkill(rows, byPath, byContent, source, dir, home);
    }
  }

  const keys = assignKeys(rows);
  const skills = rows.map((row, index): SkillEntry => {
    const key = keys[index];
    const override = overrides[key];
    const classified = classifySkill({ name: row.name, description: row.description, category: row.category, tags: row.tags });
    const agents = SKILL_AGENTS.filter((agent) => row.agents.has(agent));
    return {
      key,
      name: row.name,
      description: row.description,
      summary: row.summary,
      area: override ?? classified.area,
      areaSource: override ? "override" : classified.source,
      agents: [...agents],
      ...(row.plugin ? { plugin: row.plugin } : {}),
      path: row.path,
      ...(row.version ? { version: row.version } : {}),
      ...(row.error ? { error: row.error } : {}),
    };
  });

  skills.sort((a, b) => {
    const order = SKILL_AREAS.indexOf(a.area) - SKILL_AREAS.indexOf(b.area);
    return order || a.name.localeCompare(b.name);
  });

  const agents = SKILL_AGENTS.map(
    (id): SkillAgentInfo => ({
      id,
      name: AGENT_NAMES[id],
      detected: installed[id],
      dirs: dirs[id],
    }),
  );

  return { agents, skills };
}

/** Area an override may name; exported for the API validator. */
export function isSkillKey(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,127}$/.test(value);
}
