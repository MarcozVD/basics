import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { atomicWrite, sha256 } from "./fsutil.js";
import {
  type Note,
  type NoteData,
  type NoteType,
  noteSchema,
  type Proposal,
  type ProposalMeta,
  proposalMetaSchema,
  TYPE_DIRS,
} from "./schema.js";

const INBOX_DIR = "inbox";
const WIKILINK = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g;

/** Strip `[[...]]` wrapping and normalize to a note id. */
export function toId(ref: string): string {
  return slugify(ref.replace(/^\[\[|\]\]$/g, "").split("|")[0]);
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9.+#]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name.startsWith(".") ? [] : walk(full);
    return e.name.endsWith(".md") ? [full] : [];
  });
}

function frontmatterRefs(data: NoteData): string[] {
  const refs: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string") refs.push(v);
    else if (Array.isArray(v)) v.forEach(push);
  };
  switch (data.type) {
    case "tech":
      push(data.layer);
      push(data.language);
      push(data.related);
      push(data.practices);
      push(data.checks);
      break;
    case "practice":
    case "check":
      push(data.applies_to);
      break;
    case "profile":
      Object.entries(data.stack).forEach(([layer, techs]) => {
        push(layer);
        push(techs);
      });
      break;
    case "project":
      push(data.profile);
      Object.entries(data.stack).forEach(([layer, techs]) => {
        push(layer);
        push(techs);
      });
      break;
  }
  return refs;
}

function extractLinks(data: NoteData, body: string): string[] {
  const links = new Set(frontmatterRefs(data).map(toId));
  for (const m of body.matchAll(WIKILINK)) links.add(toId(m[1]));
  return [...links].filter(Boolean);
}

export interface LoadIssue {
  path: string;
  message: string;
}

/** Thrown when a note changed on disk since it was read (its hash no longer matches). */
export class ConflictError extends Error {
  constructor(
    readonly path: string,
    readonly expectedHash: string,
    readonly actualHash: string,
  ) {
    super(`note changed on disk since it was read: ${path}`);
    this.name = "ConflictError";
  }
}

/** Thrown when the vault directory does not exist. */
export class VaultNotFoundError extends Error {
  constructor(readonly root: string) {
    super(`Vault not found at ${root}. Pass --vault <dir>, set BASICS_DIR, or run: basics config set vault <dir>`);
    this.name = "VaultNotFoundError";
  }
}

export class Vault {
  readonly notes = new Map<string, Note>();
  readonly backlinks = new Map<string, Set<string>>();
  readonly issues: LoadIssue[] = [];

  constructor(readonly root: string) {}

  static load(root: string): Vault {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new VaultNotFoundError(root);
    const v = new Vault(root);
    v.reload();
    return v;
  }

  reload(): void {
    this.notes.clear();
    this.backlinks.clear();
    this.issues.length = 0;
    const inbox = path.join(this.root, INBOX_DIR);
    for (const file of walk(this.root)) {
      if (file.startsWith(inbox + path.sep)) continue;
      const note = this.parseFile(file);
      if (!note) continue;
      const dup = this.notes.get(note.id);
      if (dup) {
        this.issues.push({ path: file, message: `duplicate id "${note.id}" (also in ${dup.path})` });
        continue;
      }
      this.notes.set(note.id, note);
    }
    for (const note of this.notes.values()) {
      for (const target of note.links) {
        if (!this.notes.has(target)) {
          this.issues.push({ path: note.path, message: `broken link to "${target}"` });
        }
        if (!this.backlinks.has(target)) this.backlinks.set(target, new Set());
        this.backlinks.get(target)!.add(note.id);
      }
    }
  }

  private parseFile(file: string): Note | undefined {
    try {
      const raw = fs.readFileSync(file, "utf8");
      const { data, content } = matter(raw);
      const parsed = noteSchema.safeParse(data);
      if (!parsed.success) {
        this.issues.push({ path: file, message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
        return;
      }
      const id = slugify(path.basename(file, ".md"));
      return { id, path: file, data: parsed.data, body: content.trim(), links: extractLinks(parsed.data, content), hash: sha256(raw) };
    } catch (err) {
      this.issues.push({ path: file, message: String(err) });
    }
  }

  get(id: string): Note | undefined {
    return this.notes.get(toId(id));
  }

  byType<T extends NoteType>(type: T): Note[] {
    return [...this.notes.values()].filter((n) => n.data.type === type);
  }

  /** Tech notes belonging to a layer. */
  techInLayer(layer: string): Note[] {
    const id = toId(layer);
    return this.byType("tech").filter((n) => {
      const l = (n.data as Extract<NoteData, { type: "tech" }>).layer;
      return (Array.isArray(l) ? l : [l]).map(toId).includes(id);
    });
  }

  getBacklinks(id: string): string[] {
    return [...(this.backlinks.get(toId(id)) ?? [])];
  }

  /** Writes a note directly into the vault (used by humans / approvals). */
  writeNote(id: string, data: NoteData, body: string, opts: { expectedHash?: string } = {}): string {
    const parsed = noteSchema.parse(data);
    const existing = this.get(id);
    const file = existing?.path ?? path.join(this.root, TYPE_DIRS[parsed.type], `${slugify(id)}.md`);
    if (opts.expectedHash && fs.existsSync(file)) {
      const actualHash = sha256(fs.readFileSync(file, "utf8"));
      if (actualHash !== opts.expectedHash) throw new ConflictError(file, opts.expectedHash, actualHash);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const stamped = { ...parsed, updated: new Date().toISOString().slice(0, 10) };
    atomicWrite(file, matter.stringify(`${body.trim()}\n`, stripEmpty(stamped)));
    this.reload();
    return file;
  }

  // ---- Inbox: agent proposals awaiting human review ----

  propose(id: string, data: NoteData, body: string, meta: Omit<ProposalMeta, "action" | "created">): Proposal {
    const parsed = noteSchema.parse(data);
    const slug = slugify(id);
    const action = this.get(slug) ? "update" : "create";
    const proposal: ProposalMeta = { ...meta, action, created: new Date().toISOString() };
    const file = path.join(this.root, INBOX_DIR, `${slug}.md`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    atomicWrite(file, matter.stringify(`${body.trim()}\n`, { ...stripEmpty(parsed), proposal }));
    return { id: slug, path: file, meta: proposal, data: parsed, body };
  }

  listProposals(): Proposal[] {
    return walk(path.join(this.root, INBOX_DIR)).flatMap((file) => {
      const { data, content } = matter(fs.readFileSync(file, "utf8"));
      const { proposal, ...rest } = data;
      const meta = proposalMetaSchema.safeParse(proposal);
      const note = noteSchema.safeParse(rest);
      if (!meta.success || !note.success) return [];
      return [{ id: slugify(path.basename(file, ".md")), path: file, meta: meta.data, data: note.data, body: content.trim() }];
    });
  }

  approve(id: string): string {
    const p = this.listProposals().find((x) => x.id === slugify(id));
    if (!p) throw new Error(`no proposal "${id}" in inbox`);
    const file = this.writeNote(p.id, { ...p.data, source: `agent:${p.meta.proposed_by}` }, p.body);
    fs.rmSync(p.path);
    return file;
  }

  reject(id: string): void {
    const p = this.listProposals().find((x) => x.id === slugify(id));
    if (!p) throw new Error(`no proposal "${id}" in inbox`);
    fs.rmSync(p.path);
  }
}

function stripEmpty(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && !(Array.isArray(v) && v.length === 0)));
}
