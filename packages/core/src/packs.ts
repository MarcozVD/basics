import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import type { PackAddResult, PackInstallResult, PackUpdateResult } from "./api.js";
import { type Note, type NoteData, type NoteType, noteSchema, TYPE_DIRS } from "./schema.js";
import { parseTarGz } from "./tar.js";
import { NotFoundError, slugify, type Vault } from "./vault.js";

export interface PackManifest {
  name: string;
  version: string;
  description: Record<string, string>;
  requires: string[];
  languages: string[];
}

export interface PackInfo extends PackManifest {
  dir: string;
  notes: number;
  installed: string | null;
  /** "bundled" for the packs shipped with basics, "github" for community packs from a repo. */
  origin: "bundled" | "github";
  /** `owner/repo` for community packs. */
  repo?: string;
  /** Stored ref for community packs. */
  ref?: string;
}

const packManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.record(z.string(), z.string()),
  requires: z.array(z.string()).default([]),
  languages: z.array(z.string()).min(1),
});

const PACK_NAME = /^[a-z0-9][a-z0-9-]*$/;
/** Community pack ids are `owner/repo`; each segment follows the bundled rules. */
const COMMUNITY_PACK_NAME = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
type PackNote = ReturnType<typeof packNotes>[number];

/** True when the id is a community pack of the `owner/repo` form. */
export function isCommunityPackName(name: string): boolean {
  return COMMUNITY_PACK_NAME.test(name);
}

function assertCommunityPackName(name: string): void {
  // The regex requires every segment to start alphanumeric, so `..` can never
  // resolve a path outside the storage dir.
  if (!COMMUNITY_PACK_NAME.test(name)) throw new NotFoundError(`pack:${name}`);
}

function assertPackName(name: string): void {
  // Bundled names keep the strict regex; slash names are accepted so the same
  // readers work on the per-vault community cache (owner/repo is nested there).
  if (!PACK_NAME.test(name) && !COMMUNITY_PACK_NAME.test(name)) throw new NotFoundError(`pack:${name}`);
}

function noteFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return noteFiles(full);
      return e.name.endsWith(".md") ? [full] : [];
    })
    .sort();
}

/** Numeric comparison of dot-separated versions; prerelease tags are ignored. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((s) => Number.parseInt(s, 10) || 0);
  const pb = b.split(".").map((s) => Number.parseInt(s, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function listPacks(packsDir: string, vault?: Vault): PackInfo[] {
  const installed = vault ? installedPacks(vault) : {};
  const bundled: PackInfo[] = fs.existsSync(packsDir)
    ? fs
        .readdirSync(packsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && fs.existsSync(path.join(packsDir, e.name, "pack.json")))
        .map((e) => e.name)
        .sort()
        .map((name) => {
          const dir = path.join(packsDir, name);
          const manifest = readPack(packsDir, name);
          const defaultLang = path.join(dir, "notes", manifest.languages[0]);
          return { ...manifest, dir, notes: noteFiles(defaultLang).length, installed: installed[name] ?? null, origin: "bundled" };
        })
    : [];
  return [...bundled, ...(vault ? listCommunityPacks(vault, installed) : [])];
}

export function readPack(packsDir: string, name: string): PackManifest {
  assertPackName(name);
  const file = path.join(packsDir, name, "pack.json");
  if (!fs.existsSync(file)) throw new NotFoundError(`pack:${name}`);
  return packManifestSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function packNotes(packsDir: string, name: string, lang?: string): { id: string; type: NoteType; data: NoteData; body: string }[] {
  const manifest = readPack(packsDir, name);
  const language = lang ?? manifest.languages[0];
  if (!manifest.languages.includes(language)) throw new NotFoundError(`pack:${name}:${language}`);
  const dir = path.join(packsDir, name, "notes", language);
  if (!fs.existsSync(dir)) throw new NotFoundError(`pack:${name}:${language}`);
  return noteFiles(dir).map((file) => {
    const { data, content } = matter(fs.readFileSync(file, "utf8"));
    const parsed = noteSchema.parse(data);
    return { id: slugify(path.basename(file, ".md")), type: parsed.type, data: parsed, body: content.trim() };
  });
}

export function installPack(
  vault: Vault,
  packsDir: string,
  name: string,
  opts: { lang?: string; withRequires?: boolean } = {},
): PackInstallResult {
  const installed: string[] = [];
  const skipped: string[] = [];
  const byPack: Record<string, { installed: string[]; skipped: string[] }> = {};
  const done = new Set<string>();
  const written = new Set<string>();
  const stack: string[] = [];

  const install = (packName: string, withRequires: boolean): void => {
    if (stack.includes(packName)) throw new Error(`pack dependency cycle: ${[...stack, packName].join(" -> ")}`);
    if (done.has(packName)) return;
    stack.push(packName);
    const manifest = readPack(packsDir, packName);
    if (withRequires) for (const required of manifest.requires) install(required, true);
    const counts: { installed: string[]; skipped: string[] } = { installed: [], skipped: [] };
    byPack[packName] = counts;
    const lang = opts.lang ?? manifest.languages[0];
    for (const note of packNotes(packsDir, packName, lang)) {
      if (vault.get(note.id) || written.has(note.id)) {
        counts.skipped.push(note.id);
        skipped.push(note.id);
        continue;
      }
      vault.writeNote(note.id, { ...note.data, source: `pack:${packName}@${manifest.version}`, pack_lang: lang }, note.body, {
        reload: false,
      });
      written.add(note.id);
      counts.installed.push(note.id);
      installed.push(note.id);
    }
    stack.pop();
    done.add(packName);
  };

  install(name, opts.withRequires ?? true);
  vault.reload();
  return { installed, skipped, byPack };
}

/** Stable JSON for frontmatter comparison, ignoring the fields the vault stamps. */
function canonicalNote(data: NoteData): string {
  const rest: Record<string, unknown> = { ...data };
  delete rest.source;
  delete rest.updated;
  delete rest.pack_lang;
  return JSON.stringify(sortKeys(rest));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function sameNote(current: Note, next: { data: NoteData; body: string }): boolean {
  return current.body.trim() === next.body.trim() && canonicalNote(current.data) === canonicalNote(next.data);
}

export function updatePack(vault: Vault, packsDir: string, name: string): PackUpdateResult {
  const installed = installedPacks(vault);
  const oldVersion = installed[name];
  if (!oldVersion) throw new Error(`pack not installed: ${name}`);
  const manifest = readPack(packsDir, name);
  const installedNotes = [...vault.notes.values()].filter((note) => note.data.source.startsWith(`pack:${name}@`));
  const langOf = (note: Note): string => {
    const stored = note.data.pack_lang;
    const lang = typeof stored === "string" ? stored : manifest.languages[0];
    return manifest.languages.includes(lang) ? lang : manifest.languages[0];
  };

  const counts = new Map<string, number>();
  for (const note of installedNotes) counts.set(langOf(note), (counts.get(langOf(note)) ?? 0) + 1);
  const majority = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? manifest.languages[0];

  const byLang = new Map<string, Map<string, PackNote>>();
  const notesFor = (lang: string): Map<string, PackNote> => {
    let notes = byLang.get(lang);
    if (!notes) {
      notes = new Map(packNotes(packsDir, name, lang).map((note) => [note.id, note]));
      byLang.set(lang, notes);
    }
    return notes;
  };
  const primary = notesFor(majority);
  const ids = [...primary.keys()];
  for (const lang of counts.keys()) {
    for (const id of notesFor(lang).keys()) if (!ids.includes(id)) ids.push(id);
  }

  if (compareVersions(manifest.version, oldVersion) <= 0) {
    return { proposed: [], unchanged: ids, skipped: [], upToDate: true };
  }

  const proposed: string[] = [];
  const unchanged: string[] = [];
  const skipped: string[] = [];
  const meta = { proposed_by: `pack:${name}@${manifest.version}`, reason: `Pack ${name} ${oldVersion} → ${manifest.version}` };

  for (const id of ids) {
    const current = vault.get(id);
    let lang = majority;
    if (current) {
      const preferred = langOf(current);
      if (notesFor(preferred).has(id)) lang = preferred;
    }
    const note = notesFor(lang).get(id);
    if (!note) continue;
    if (current) {
      if (!current.data.source.startsWith(`pack:${name}@`)) {
        skipped.push(id);
        continue;
      }
      if (sameNote(current, note)) {
        unchanged.push(id);
        continue;
      }
    }
    vault.propose(note.id, { ...note.data, pack_lang: lang }, note.body, meta);
    proposed.push(id);
  }
  return { proposed, unchanged, skipped, upToDate: false };
}

/** Installed packs derived from note sources, keeping the highest version per pack. */
export function installedPacks(vault: Vault): Record<string, string> {
  const found: Record<string, string> = {};
  for (const note of vault.notes.values()) {
    const match = /^pack:([^@]+)@(.+)$/.exec(note.data.source);
    if (!match) continue;
    const [, name, version] = match;
    if (found[name] === undefined || compareVersions(version, found[name]) > 0) found[name] = version;
  }
  return found;
}

// ---------------------------------------------------------------------------
// Community packs: downloaded from GitHub, extracted under the vault, proposed
// to the inbox for human review (never installed or executed directly).
// ---------------------------------------------------------------------------

/** Thrown for anything wrong with a downloaded/cached community pack. */
export class PackDownloadError extends Error {
  constructor(
    message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = "PackDownloadError";
  }
}

/** Git refs and `--path` subdirs: plain segments only, never `..`. */
const SAFE_REF = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/;
const SAFE_SUBDIR = /^(?!.*\.\.)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;
/** Note file names: no `:` (NTFS alternate streams), spaces or other surprises. */
const SAFE_NOTE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;

function assertSafeRef(ref: string): void {
  if (!SAFE_REF.test(ref)) throw new PackDownloadError(`invalid ref "${ref}"`, "use a branch, tag or commit sha");
}

function assertSafeSubdir(subdir: string): void {
  if (!SAFE_SUBDIR.test(subdir.replace(/^\/+|\/+$/g, ""))) {
    throw new PackDownloadError(`invalid --path "${subdir}"`, "use a relative directory inside the repo, without ..");
  }
}

const TAR_LIMITS = { maxFileBytes: 256 * 1024, maxEntries: 1000, maxUnpackedBytes: 10 * 1024 * 1024 };

/** Base URL for pack archives; overridable so tests never touch the network. */
function packArchiveBase(): string {
  const override = process.env.BASICS_PACK_FETCH_BASE?.trim();
  return override ? override.replace(/\/+$/, "") : "https://codeload.github.com";
}

/** Root of the per-vault community pack cache. */
export function communityPacksDir(vault: Vault): string {
  return path.join(vault.root, ".basics", "packs");
}

/** Cache dir for one community pack: <vault>/.basics/packs/<owner>/<repo>. */
export function communityPackDir(vault: Vault, name: string): string {
  assertCommunityPackName(name);
  return path.join(communityPacksDir(vault), ...name.split("/"));
}

export interface CommunityPackSource {
  repo: string;
  ref: string;
  /** `--path` subdir inside the repo, reused by `pack update`. */
  path?: string;
  sha?: string;
  fetched_at: string;
  version: string;
}

function readCommunitySource(dir: string): CommunityPackSource | undefined {
  const file = path.join(dir, "source.json");
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as CommunityPackSource;
  } catch {
    return undefined;
  }
}

function listCommunityPacks(vault: Vault, installed: Record<string, string>): PackInfo[] {
  const root = communityPacksDir(vault);
  if (!fs.existsSync(root)) return [];
  const out: PackInfo[] = [];
  for (const owner of fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const ownerDir = path.join(root, owner.name);
    for (const repo of fs.readdirSync(ownerDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      const dir = path.join(ownerDir, repo.name);
      if (!fs.existsSync(path.join(dir, "pack.json"))) continue;
      const name = `${owner.name}/${repo.name}`;
      if (!COMMUNITY_PACK_NAME.test(name)) continue;
      try {
        const manifest = readPack(root, name);
        const defaultLang = path.join(dir, "notes", manifest.languages[0]);
        const source = readCommunitySource(dir);
        out.push({
          ...manifest,
          dir,
          notes: noteFiles(defaultLang).length,
          installed: installed[name] ?? null,
          origin: "github",
          repo: name,
          ref: source?.ref ?? "HEAD",
        });
      } catch {
        // A corrupted cache entry is hidden rather than fatal.
      }
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Download a repo archive (tar.gz) and return its bytes. */
async function fetchPackArchive(owner: string, repo: string, ref: string): Promise<Buffer> {
  const url = `${packArchiveBase()}/${owner}/${repo}/tar.gz/${ref}`;
  const headers: Record<string, string> = {};
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  let res: Response;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new PackDownloadError(
      "could not download the pack (network error)",
      "check your connection, and that the repo and ref are public",
    );
  }
  if (res.status === 404) {
    throw new PackDownloadError(
      `pack ${owner}/${repo}@${ref} not found (HTTP ${res.status})`,
      "check the owner/repo and ref, and that the repository is public",
    );
  }
  if (!res.ok) {
    throw new PackDownloadError(`could not download the pack (HTTP ${res.status})`, "the ref may not exist or the repo may be private");
  }
  return Buffer.from(await res.arrayBuffer());
}

export interface ExtractedCommunityNote {
  id: string;
  lang: string;
  type: NoteType;
  data: NoteData;
  body: string;
  /** Original markdown (frontmatter + body) as shipped in the repo. */
  raw: string;
  /** Path inside the cache where the file is stored, forward slashes. */
  relPath: string;
}

export interface ExtractedCommunityPack {
  manifest: PackManifest;
  notes: ExtractedCommunityNote[];
  invalid: { file: string; reason: string }[];
}

/** Split archive entries into a manifest + validated notes, ignoring everything else. */
export function extractCommunityPack(entries: { path: string; data: Buffer }[]): ExtractedCommunityPack {
  const manifestEntry = entries.find((e) => e.path === "pack.json");
  if (!manifestEntry) {
    throw new PackDownloadError("archive has no pack.json", "a pack repo needs a pack.json at its root (or under --path)");
  }
  let manifest: PackManifest;
  try {
    manifest = packManifestSchema.parse(JSON.parse(manifestEntry.data.toString("utf8")));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new PackDownloadError(`invalid pack.json: ${reason}`);
  }

  const notes: ExtractedCommunityNote[] = [];
  const invalid: { file: string; reason: string }[] = [];
  for (const entry of entries) {
    if (entry.path === "pack.json") continue;
    const parts = entry.path.split("/");
    const fileName = parts.at(-1) ?? "";
    if (parts.length !== 4 || parts[0] !== "notes" || !fileName.endsWith(".md")) continue;
    if (!SAFE_NOTE_FILE.test(fileName)) {
      invalid.push({ file: entry.path, reason: "file name must use only letters, digits, '.', '_' and '-'" });
      continue;
    }
    const [, lang, typeDir] = parts;
    if (!manifest.languages.includes(lang)) continue;
    if (!Object.values(TYPE_DIRS).includes(typeDir)) continue;
    const id = slugify(fileName.slice(0, -3));
    try {
      const { data, content } = matter(entry.data.toString("utf8"));
      // A markdown file with no `type` (e.g. no frontmatter at all) is not a
      // note; ignore it rather than reporting it as invalid.
      if (typeof data.type !== "string") continue;
      const parsed = noteSchema.safeParse(data);
      if (!parsed.success) {
        const reason = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        invalid.push({ file: entry.path, reason });
        continue;
      }
      notes.push({
        id,
        lang,
        type: parsed.data.type,
        data: parsed.data,
        body: content.trim(),
        raw: entry.data.toString("utf8"),
        relPath: `notes/${lang}/${typeDir}/${fileName}`,
      });
    } catch (err) {
      invalid.push({ file: entry.path, reason: err instanceof Error ? err.message : String(err) });
    }
  }
  return { manifest, notes, invalid };
}

/** Strip the optional `--path <subdir>` from every archive path. */
function applyPackSubdir(entries: { path: string; data: Buffer }[], subdir: string | undefined): { path: string; data: Buffer }[] {
  if (!subdir) return entries;
  assertSafeSubdir(subdir);
  const prefix = `${subdir.replace(/^\/+|\/+$/g, "")}/`;
  const out = entries.filter((e) => e.path.startsWith(prefix)).map((e) => ({ path: e.path.slice(prefix.length), data: e.data }));
  if (!out.length)
    throw new PackDownloadError(`--path ${subdir} does not exist in the archive`, "point --path at a directory with a pack.json");
  return out;
}

/** Persist an extracted pack + source.json under the vault cache. */
export function writeCommunityPackCache(vault: Vault, name: string, source: CommunityPackSource, pack: ExtractedCommunityPack): string {
  const dir = communityPackDir(vault, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "notes"), { recursive: true });
  for (const note of pack.notes) {
    const file = path.join(dir, ...note.relPath.split("/"));
    const resolved = path.resolve(file);
    if (!resolved.startsWith(path.resolve(dir))) throw new PackDownloadError(`unsafe note path: ${note.relPath}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, note.raw);
  }
  fs.writeFileSync(path.join(dir, "pack.json"), JSON.stringify(pack.manifest, null, 2));
  fs.writeFileSync(path.join(dir, "source.json"), `${JSON.stringify(source, null, 2)}\n`);
  return dir;
}

export interface CommunityProposalCounts {
  proposed_new: string[];
  proposed_changed: string[];
  unchanged: string[];
  skipped: string[];
  invalid: { file: string; reason: string }[];
}

/**
 * Propose the notes of a freshly extracted community pack. Nothing is written
 * to the vault: every note lands in the inbox as `pack:<owner>/<repo>@<version>`.
 */
export function proposeCommunityPackNotes(
  vault: Vault,
  name: string,
  version: string,
  pack: ExtractedCommunityPack,
  lang?: string,
): CommunityProposalCounts {
  const manifest = pack.manifest;
  const language = lang ?? manifest.languages[0];
  if (!manifest.languages.includes(language)) {
    throw new PackDownloadError(`pack ${name} has no ${language} notes`, `languages: ${manifest.languages.join(", ")}`);
  }
  const installed = installedPacks(vault)[name];
  const reason = installed ? `Pack ${name} ${installed} → ${version}` : `New community pack ${name}@${version}`;
  const meta = { proposed_by: `pack:${name}@${version}`, reason };

  const byId = new Map<string, ExtractedCommunityNote>();
  for (const note of pack.notes) {
    if (note.lang !== language) continue;
    if (byId.has(note.id)) {
      // Same id in two type dirs is ambiguous; keep the first and skip the rest.
      continue;
    }
    byId.set(note.id, note);
  }

  const counts: CommunityProposalCounts = { proposed_new: [], proposed_changed: [], unchanged: [], skipped: [], invalid: pack.invalid };
  for (const [id, note] of byId) {
    const current = vault.get(id);
    if (current) {
      if (!current.data.source.startsWith(`pack:${name}@`)) {
        counts.skipped.push(id);
        continue;
      }
      if (sameNote(current, { data: note.data, body: note.body })) {
        counts.unchanged.push(id);
        continue;
      }
    }
    // The shipped frontmatter never decides provenance; approval sets the same source.
    vault.propose(id, { ...note.data, source: meta.proposed_by, pack_lang: language }, note.body, meta);
    (current ? counts.proposed_changed : counts.proposed_new).push(id);
  }
  return counts;
}

function parseRepoInput(raw: string): { owner: string; repo: string; ref: string } {
  const idx = raw.indexOf("@");
  const body = idx === -1 ? raw : raw.slice(0, idx);
  const ref = idx === -1 ? "HEAD" : raw.slice(idx + 1) || "HEAD";
  const slash = body.indexOf("/");
  if (slash === -1) {
    throw new PackDownloadError(`expected owner/repo, got "${raw}"`, "use basics pack add <owner>/<repo>[@ref]");
  }
  const owner = body.slice(0, slash);
  const repo = body.slice(slash + 1);
  assertCommunityPackName(`${owner}/${repo}`);
  return { owner, repo, ref };
}

/**
 * Add a community pack: download, extract, cache, then propose its notes.
 * Returns the proposal counts; nothing is installed automatically.
 */
export async function addCommunityPack(
  vault: Vault,
  input: { owner: string; repo: string; ref?: string; path?: string; lang?: "en" | "es" },
): Promise<PackAddResult> {
  const name = `${input.owner}/${input.repo}`;
  assertCommunityPackName(name);
  const ref = input.ref ?? "HEAD";
  assertSafeRef(ref);
  if (input.path) assertSafeSubdir(input.path);
  const raw = await fetchPackArchive(input.owner, input.repo, ref);
  const parsed = parseTarGz(raw, TAR_LIMITS);
  const entries = applyPackSubdir(parsed, input.path);
  const pack = extractCommunityPack(entries);
  const version = pack.manifest.version;
  writeCommunityPackCache(vault, name, { repo: name, ref, path: input.path, fetched_at: new Date().toISOString(), version }, pack);
  const counts = proposeCommunityPackNotes(vault, name, version, pack, input.lang);
  return { name, version, ref, repo: name, ...counts, upToDate: false };
}

/**
 * Re-fetch the stored ref of a cached community pack and propose only the
 * changed notes. No-op (upToDate) when the version did not increase.
 */
export async function updateCommunityPack(vault: Vault, raw: string): Promise<PackAddResult> {
  const { owner, repo } = parseRepoInput(raw);
  const name = `${owner}/${repo}`;
  const dir = communityPackDir(vault, name);
  const previous = readCommunitySource(dir);
  if (!previous) {
    throw new PackDownloadError(`community pack ${name} is not cached`, `run basics pack add ${name} first`);
  }
  const installed = installedPacks(vault)[name];
  assertSafeRef(previous.ref);
  const bytes = await fetchPackArchive(owner, repo, previous.ref);
  const parsed = parseTarGz(bytes, TAR_LIMITS);
  const pack = extractCommunityPack(applyPackSubdir(parsed, previous.path));
  const version = pack.manifest.version;
  writeCommunityPackCache(vault, name, { ...previous, version, fetched_at: new Date().toISOString() }, pack);
  if (installed && compareVersions(version, installed) <= 0) {
    return {
      name,
      version,
      ref: previous.ref,
      repo: name,
      proposed_new: [],
      proposed_changed: [],
      unchanged: [...new Set(pack.notes.map((n) => n.id))],
      skipped: [],
      invalid: pack.invalid,
      upToDate: true,
    };
  }
  const counts = proposeCommunityPackNotes(vault, name, version, pack);
  return { name, version, ref: previous.ref, repo: name, ...counts, upToDate: false };
}

/**
 * Delete the community pack cache only; installed notes stay in the vault.
 * Returns false when there was nothing cached.
 */
export function removeCommunityPack(vault: Vault, raw: string): boolean {
  const { owner, repo } = parseRepoInput(raw);
  const dir = communityPackDir(vault, `${owner}/${repo}`);
  if (!fs.existsSync(dir)) return false;
  fs.rmSync(dir, { recursive: true, force: true });
  return true;
}
