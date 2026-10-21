import fs from "node:fs";
import path from "node:path";
import semver from "semver";
import { parse as parseToml, type TomlTable, type TomlValue } from "smol-toml";
import type { TechData } from "./schema.js";
import type { Vault } from "./vault.js";

export interface DetectedTech {
  id: string;
  version?: string;
  source: string;
}

export interface UnknownPackage {
  ecosystem: "npm" | "pypi";
  name: string;
  version?: string;
}

export interface DetectResult {
  techs: DetectedTech[];
  unknown: UnknownPackage[];
  files: string[];
}

interface TechIndex {
  npm: Map<string, string>;
  pypi: Map<string, string>;
  ids: Set<string>;
  databases: Set<string>;
}

const NPM_FILE = "package.json";
const PYPROJECT_FILE = "pyproject.toml";
const REQUIREMENTS_FILE = "requirements.txt";
const REQUIREMENTS_DEV_FILE = "requirements-dev.txt";

/** PEP 503 normalization for Python package names. */
function normalizePypi(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

function techIndex(vault: Vault): TechIndex {
  const index: TechIndex = { npm: new Map(), pypi: new Map(), ids: new Set(), databases: new Set() };
  for (const note of vault.byType("tech")) {
    const tech = note.data as TechData;
    index.ids.add(note.id);
    if (tech.kind === "database") index.databases.add(note.id);
    for (const name of tech.packages?.npm ?? []) index.npm.set(name, note.id);
    for (const name of tech.packages?.pypi ?? []) index.pypi.set(normalizePypi(name), note.id);
  }
  return index;
}

function lookup(ecosystem: "npm" | "pypi", name: string, index: TechIndex): string | undefined {
  const key = ecosystem === "pypi" ? normalizePypi(name) : name;
  const mapped = ecosystem === "npm" ? index.npm.get(key) : index.pypi.get(key);
  if (mapped) return mapped;
  return index.ids.has(key) ? key : undefined;
}

function npmVersion(range: string): string | undefined {
  try {
    return semver.minVersion(range)?.version;
  } catch {
    return undefined;
  }
}

function pythonVersion(range: string | undefined): string | undefined {
  if (!range) return undefined;
  const match = /(?:>=|==|~=)\s*([^,\s]+)/.exec(range);
  return match ? (semver.coerce(match[1])?.version ?? undefined) : undefined;
}

function parseRequirement(spec: string): { name: string; version?: string } {
  const clean = spec.split(";")[0].trim();
  const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*(?:\[[^\]]*\])?\s*(.*)$/.exec(clean);
  if (!match) return { name: normalizePypi(clean) };
  return { name: normalizePypi(match[1]), version: pythonVersion(match[2]) };
}

function table(value: TomlValue | undefined): TomlTable | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as TomlTable) : undefined;
}

function tableVersion(value: TomlValue | undefined): string | undefined {
  if (typeof value === "string") return value;
  const version = table(value)?.version;
  return typeof version === "string" ? version : undefined;
}

function strings(value: TomlValue | undefined): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

/** Minimum version of a declaration, for either ecosystem. */
export function inRange(version: string | undefined, since?: string, until?: string): boolean {
  const current = version ? semver.coerce(version) : null;
  if (!current) return true;
  const from = since ? semver.coerce(since) : null;
  if (from && semver.lt(current, from)) return false;
  const to = until ? semver.coerce(until) : null;
  if (to && semver.gte(current, to)) return false;
  return true;
}

export function detectStack(vault: Vault, dir: string): DetectResult {
  const index = techIndex(vault);
  const techs = new Map<string, DetectedTech>();
  const unknown: UnknownPackage[] = [];
  const files: string[] = [];
  const seenUnknown = new Set<string>();

  const addTech = (id: string, detectedVersion: string | undefined, source: string): void => {
    const version = index.databases.has(id) ? undefined : detectedVersion;
    const found = techs.get(id);
    if (!found) techs.set(id, { id, version, source });
    else if (!found.version && version) found.version = version;
  };
  const addUnknown = (ecosystem: "npm" | "pypi", name: string, version: string | undefined): void => {
    const key = `${ecosystem}:${name}`;
    if (seenUnknown.has(key)) return;
    seenUnknown.add(key);
    unknown.push({ ecosystem, name, version });
  };
  const addNpm = (name: string, range: string, source: string): void => {
    if (name.startsWith("@types/")) return;
    const version = npmVersion(range);
    const id = lookup("npm", name, index);
    if (id) addTech(id, version, source);
    else addUnknown("npm", name, version);
  };
  const addPypi = (name: string, version: string | undefined, source: string): void => {
    if (!name) return;
    const id = lookup("pypi", name, index);
    if (id) addTech(id, version, source);
    else addUnknown("pypi", name, version);
  };

  const npmFile = path.join(dir, NPM_FILE);
  if (fs.existsSync(npmFile)) {
    files.push(NPM_FILE);
    try {
      const raw = JSON.parse(fs.readFileSync(npmFile, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps = { ...raw.dependencies, ...raw.devDependencies };
      for (const [name, range] of Object.entries(deps)) {
        if (typeof range === "string") addNpm(name, range, NPM_FILE);
      }
      if (typeof deps.typescript === "string") addTech("typescript", npmVersion(deps.typescript), NPM_FILE);
    } catch {
      // An unreadable manifest is reported by the tooling, not by detection.
    }
  }

  const pyprojectFile = path.join(dir, PYPROJECT_FILE);
  let requiresPython: string | undefined;
  if (fs.existsSync(pyprojectFile)) {
    files.push(PYPROJECT_FILE);
    try {
      const doc = parseToml(fs.readFileSync(pyprojectFile, "utf8"));
      const project = table(doc.project);
      for (const spec of strings(project?.dependencies)) {
        const req = parseRequirement(spec);
        addPypi(req.name, req.version, PYPROJECT_FILE);
      }
      const optional = table(project?.["optional-dependencies"]);
      for (const value of Object.values(optional ?? {})) {
        for (const spec of strings(value)) {
          const req = parseRequirement(spec);
          addPypi(req.name, req.version, PYPROJECT_FILE);
        }
      }
      requiresPython = typeof project?.["requires-python"] === "string" ? project["requires-python"] : undefined;

      const poetry = table(table(doc.tool)?.poetry);
      const poetryDeps = table(poetry?.dependencies);
      for (const [name, value] of Object.entries(poetryDeps ?? {})) {
        if (name === "python") continue;
        addPypi(normalizePypi(name), pythonVersion(tableVersion(value)), PYPROJECT_FILE);
      }
      const groups = table(poetry?.group);
      for (const group of Object.values(groups ?? {})) {
        const deps = table(table(group)?.dependencies);
        for (const [name, value] of Object.entries(deps ?? {})) {
          addPypi(normalizePypi(name), pythonVersion(tableVersion(value)), PYPROJECT_FILE);
        }
      }
    } catch {
      // Invalid TOML is left to the project's own tooling.
    }
  }

  for (const file of [REQUIREMENTS_FILE, REQUIREMENTS_DEV_FILE]) {
    const requirementsFile = path.join(dir, file);
    if (!fs.existsSync(requirementsFile)) continue;
    files.push(file);
    for (const line of fs.readFileSync(requirementsFile, "utf8").split(/\r?\n/)) {
      const clean = line.split("#")[0].trim();
      if (!clean || clean.startsWith("-")) continue;
      const req = parseRequirement(clean);
      addPypi(req.name, req.version, file);
    }
  }

  const pythonSource = files.includes(PYPROJECT_FILE)
    ? PYPROJECT_FILE
    : files.includes(REQUIREMENTS_FILE)
      ? REQUIREMENTS_FILE
      : files.includes(REQUIREMENTS_DEV_FILE)
        ? REQUIREMENTS_DEV_FILE
        : undefined;
  if (pythonSource) addTech("python", pythonVersion(requiresPython), pythonSource);

  return { techs: [...techs.values()], unknown, files };
}
