import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import type { PackInstallResult, PackUpdateResult } from "./api.js";
import { type Note, type NoteData, type NoteType, noteSchema } from "./schema.js";
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
}

const packManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.record(z.string(), z.string()),
  requires: z.array(z.string()).default([]),
  languages: z.array(z.string()).min(1),
});

const PACK_NAME = /^[a-z0-9][a-z0-9-]*$/;
type PackNote = ReturnType<typeof packNotes>[number];

function assertPackName(name: string): void {
  if (!PACK_NAME.test(name)) throw new NotFoundError(`pack:${name}`);
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
  if (!fs.existsSync(packsDir)) return [];
  const installed = vault ? installedPacks(vault) : {};
  return fs
    .readdirSync(packsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(packsDir, e.name, "pack.json")))
    .map((e) => e.name)
    .sort()
    .map((name) => {
      const dir = path.join(packsDir, name);
      const manifest = readPack(packsDir, name);
      const defaultLang = path.join(dir, "notes", manifest.languages[0]);
      return { ...manifest, dir, notes: noteFiles(defaultLang).length, installed: installed[name] ?? null };
    });
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
