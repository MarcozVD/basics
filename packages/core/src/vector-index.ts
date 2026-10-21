import fs from "node:fs";
import path from "node:path";
import { basicsDir } from "./activity.js";
import type { Embedder } from "./embeddings.js";
import type { Note, TechData } from "./schema.js";
import type { Vault } from "./vault.js";

export type VectorSlot = "pos" | "neg" | "main";

export interface IndexedNote {
  hash: string;
  vectors: Partial<Record<VectorSlot, number>>;
}

export interface IndexFile {
  model: string;
  dim: number;
  notes: Record<string, IndexedNote>;
}

export interface SyncStats {
  model: string;
  dim: number;
  notes: number;
  embedded: number;
  reused: number;
  removed: number;
}

export interface LoadedIndex {
  model?: string;
  dim?: number;
  notes: number;
  get(id: string, slot: VectorSlot): Float32Array | undefined;
  stale(vault: Vault): string[];
}

const SLOTS: VectorSlot[] = ["pos", "neg", "main"];
const BATCH = 16;
const BODY_CHARS = 300;

export function embeddingPaths(vault: Vault): { json: string; bin: string } {
  const dir = path.join(vault.root, ".basics");
  return { json: path.join(dir, "embeddings.json"), bin: path.join(dir, "embeddings.bin") };
}

function noteTitle(note: Note): string {
  return note.data.title ?? note.id;
}

/** First non-empty body line, skipping headings and fenced code. */
function firstBodyLine(body: string): string {
  let fenced = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !line || line.startsWith("#") || /^(-{3,}|\*{3,})$/.test(line)) continue;
    return line
      .replace(/^([-*+]|\d+\.)\s+/, "")
      .replace(/^>\s*/, "")
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
      .replace(/\[\[([^\]]+)\]\]/g, "$1")
      .replace(/[*_`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  return "";
}

/** Texts to embed per note; layers and projects are not indexed. */
function noteTexts(note: Note): Partial<Record<VectorSlot, string>> {
  const title = noteTitle(note);
  if (note.data.type === "tech") {
    const d = note.data as TechData;
    const pos = [title, ...d.use_when, ...d.performs_best, ...d.tags, firstBodyLine(note.body)].filter(Boolean).join(" ");
    const neg = d.avoid_when.join(" ").trim();
    return neg ? { pos, neg } : { pos };
  }
  if (note.data.type === "practice" || note.data.type === "check") {
    return { main: `${title} ${note.body.slice(0, BODY_CHARS)}`.trim() };
  }
  if (note.data.type === "profile") {
    return { main: [title, note.data.description, ...note.data.use_when].filter(Boolean).join(" ") };
  }
  return {};
}

function indexableNotes(vault: Vault): Note[] {
  return [...vault.notes.values()]
    .filter((note) => SLOTS.some((slot) => noteTexts(note)[slot] !== undefined))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function readJson(file: string): unknown {
  if (!fs.existsSync(file)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return undefined;
  }
}

function parseIndex(value: unknown): IndexFile | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as { model?: unknown; dim?: unknown; notes?: unknown };
  if (typeof raw.model !== "string" || typeof raw.dim !== "number" || !raw.notes || typeof raw.notes !== "object") return undefined;
  const notes: Record<string, IndexedNote> = {};
  for (const [id, entry] of Object.entries(raw.notes as Record<string, unknown>)) {
    if (!entry || typeof entry !== "object") continue;
    const { hash, vectors } = entry as { hash?: unknown; vectors?: unknown };
    if (typeof hash !== "string" || !vectors || typeof vectors !== "object") continue;
    const clean: Partial<Record<VectorSlot, number>> = {};
    for (const slot of SLOTS) {
      const offset = (vectors as Record<string, unknown>)[slot];
      if (typeof offset === "number" && Number.isInteger(offset) && offset >= 0) clean[slot] = offset;
    }
    notes[id] = { hash, vectors: clean };
  }
  return { model: raw.model, dim: raw.dim, notes };
}

function readRows(file: string): Float32Array | undefined {
  try {
    const buffer = fs.readFileSync(file);
    if (buffer.byteLength % 4 !== 0) return undefined;
    return new Float32Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  } catch {
    return undefined;
  }
}

function atomicWriteBytes(file: string, bytes: Uint8Array): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, bytes);
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (attempt === 5 || !["EPERM", "EBUSY", "EACCES"].includes(code)) {
        fs.rmSync(tmp, { force: true });
        throw err;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
}

/**
 * Re-embed only new or changed notes, drop deleted ones, compact the rows and rewrite both
 * index files atomically. A different model or dimension rebuilds the whole index.
 */
export async function syncIndex(
  vault: Vault,
  embedder: Embedder,
  onProgress?: (done: number, total: number) => void,
  opts: { full?: boolean } = {},
): Promise<SyncStats> {
  const files = embeddingPaths(vault);
  const previous = parseIndex(readJson(files.json));
  const previousRows = readRows(files.bin);
  const reusable =
    !opts.full && previous?.model === embedder.model && previous.dim === embedder.dim && previousRows
      ? { index: previous, rows: previousRows }
      : undefined;
  const oldRows = reusable?.rows.length ?? 0;

  const tasks: { key: string; hash: string; slot: VectorSlot; text: string }[] = [];
  const plan: { note: Note; old?: IndexedNote; reuse: boolean }[] = [];
  for (const note of indexableNotes(vault)) {
    const texts = noteTexts(note);
    const slots = SLOTS.filter((slot) => texts[slot] !== undefined);
    const old = reusable?.index.notes[note.id];
    const canReuse =
      old !== undefined &&
      old.hash === note.hash &&
      slots.every((slot) => {
        const offset = old.vectors[slot];
        return offset !== undefined && offset >= 0 && (offset + 1) * embedder.dim <= oldRows;
      });
    plan.push({ note, old, reuse: canReuse });
    if (canReuse) continue;
    for (const slot of slots) tasks.push({ key: note.id, hash: note.hash, slot, text: texts[slot] as string });
  }

  const embedded = new Map<string, Float32Array>();
  for (let start = 0; start < tasks.length; start += BATCH) {
    const batch = tasks.slice(start, start + BATCH);
    const vectors = await embedder.embed(
      batch.map((task) => task.text),
      "passage",
    );
    if (vectors.length !== batch.length) throw new Error(`embedder returned ${vectors.length} vectors for ${batch.length} texts`);
    batch.forEach((task, i) => {
      const vector = vectors[i];
      if (vector.length !== embedder.dim) throw new Error(`embedder returned dim ${vector.length}, expected ${embedder.dim}`);
      embedded.set(`${task.key}:${task.slot}`, vector);
    });
    onProgress?.(Math.min(start + batch.length, tasks.length), tasks.length);
  }

  const notes: Record<string, IndexedNote> = {};
  const rows: Float32Array[] = [];
  let reused = 0;
  for (const { note, old, reuse } of plan) {
    const texts = noteTexts(note);
    const vectors: Partial<Record<VectorSlot, number>> = {};
    for (const slot of SLOTS) {
      if (texts[slot] === undefined) continue;
      const oldOffset = old?.vectors[slot];
      let vector: Float32Array;
      if (reuse && oldOffset !== undefined) {
        vector = reusable?.rows.slice(oldOffset * embedder.dim, (oldOffset + 1) * embedder.dim) ?? new Float32Array(embedder.dim);
        reused += 1;
      } else {
        vector = embedded.get(`${note.id}:${slot}`) as Float32Array;
      }
      vectors[slot] = rows.length;
      rows.push(vector);
    }
    notes[note.id] = { hash: note.hash, vectors };
  }

  const packed = new Float32Array(rows.length * embedder.dim);
  rows.forEach((row, index) => {
    packed.set(row, index * embedder.dim);
  });

  basicsDir(vault.root);
  atomicWriteBytes(files.bin, new Uint8Array(packed.buffer));
  atomicWriteBytes(files.json, Buffer.from(`${JSON.stringify({ model: embedder.model, dim: embedder.dim, notes }, null, 2)}\n`));

  const removed = previous ? Object.keys(previous.notes).filter((id) => notes[id] === undefined).length : 0;
  return { model: embedder.model, dim: embedder.dim, notes: Object.keys(notes).length, embedded: tasks.length, reused, removed };
}

/** Read-only view over the index; empty when the files are missing or corrupt. */
export function loadIndex(vault: Vault): LoadedIndex {
  const files = embeddingPaths(vault);
  const index = parseIndex(readJson(files.json));
  const rows = readRows(files.bin);
  const usable = index !== undefined && rows !== undefined && index.dim > 0 && index.dim % 1 === 0 && rows.length % index.dim === 0;
  const active = usable ? { index: index as IndexFile, rows: rows as Float32Array } : undefined;

  return {
    model: index?.model,
    dim: index?.dim,
    notes: index ? Object.keys(index.notes).length : 0,
    get(id: string, slot: VectorSlot): Float32Array | undefined {
      if (!active) return undefined;
      const offset = active.index.notes[id]?.vectors[slot];
      if (offset === undefined) return undefined;
      const start = offset * active.index.dim;
      if (start < 0 || start + active.index.dim > active.rows.length) return undefined;
      return active.rows.slice(start, start + active.index.dim);
    },
    stale(current: Vault): string[] {
      const stale = new Set<string>();
      const currentIds = new Set<string>();
      for (const note of indexableNotes(current)) {
        currentIds.add(note.id);
        if (!active || active.index.notes[note.id]?.hash !== note.hash) stale.add(note.id);
      }
      if (active) for (const id of Object.keys(active.index.notes)) if (!currentIds.has(id)) stale.add(id);
      return [...stale].sort();
    },
  };
}
