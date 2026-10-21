import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { type NoteData, type NoteType, noteSchema } from "./schema.js";
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
      return { ...manifest, dir, notes: noteFiles(path.join(dir, "notes")).length, installed: installed[name] ?? null };
    });
}

export function readPack(packsDir: string, name: string): PackManifest {
  const file = path.join(packsDir, name, "pack.json");
  if (!fs.existsSync(file)) throw new NotFoundError(`pack:${name}`);
  return packManifestSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

export function packNotes(packsDir: string, name: string, lang?: string): { id: string; type: NoteType; data: NoteData; body: string }[] {
  const manifest = readPack(packsDir, name);
  const dir = path.join(packsDir, name, "notes", lang ?? manifest.languages[0]);
  if (!fs.existsSync(dir)) throw new NotFoundError(`pack:${name}:${lang ?? manifest.languages[0]}`);
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
): { installed: string[]; skipped: string[] } {
  const installed: string[] = [];
  const skipped: string[] = [];
  const done = new Set<string>();
  const stack: string[] = [];

  const install = (packName: string, withRequires: boolean): void => {
    if (stack.includes(packName)) throw new Error(`pack dependency cycle: ${[...stack, packName].join(" -> ")}`);
    if (done.has(packName)) return;
    stack.push(packName);
    const manifest = readPack(packsDir, packName);
    if (withRequires) for (const required of manifest.requires) install(required, true);
    for (const note of packNotes(packsDir, packName, opts.lang)) {
      if (vault.get(note.id)) {
        skipped.push(note.id);
        continue;
      }
      vault.writeNote(note.id, { ...note.data, source: `pack:${packName}@${manifest.version}` }, note.body);
      installed.push(note.id);
    }
    stack.pop();
    done.add(packName);
  };

  install(name, opts.withRequires ?? true);
  return { installed, skipped };
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
