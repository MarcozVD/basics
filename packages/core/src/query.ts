import fs from "node:fs";
import path from "node:path";
import type { NoteDetail, NoteSummary, ProposalDetail, VaultStats } from "./api.js";
import { NOTE_TYPES, type Note, type NoteData, type NoteType, type Proposal, type TechData } from "./schema.js";
import { serializeNote, toId, type Vault } from "./vault.js";

// Small ES/EN stopword list; the vault mixes both languages.
const STOPWORDS = new Set("a al and con de del el en es for in is la las los o of on or para por que the to un una uno with y".split(" "));

/** Lowercase, strip accents, split, drop stopwords, crude prefix stem so "concurrencia" ~ "concurrente". */
export function tokens(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => (t.length > 6 ? t.slice(0, 6) : t));
}

function overlap(query: Set<string>, text: string): number {
  return tokens(text).filter((t) => query.has(t)).length;
}

export interface SearchHit {
  id: string;
  type: NoteData["type"];
  title: string;
  score: number;
}

export function search(vault: Vault, query: string, opts: { type?: string; layer?: string; limit?: number } = {}): SearchHit[] {
  const q = new Set(tokens(query));
  const layerIds = opts.layer ? new Set(vault.techInLayer(opts.layer).map((n) => n.id)) : undefined;
  return [...vault.notes.values()]
    .filter((n) => !opts.type || n.data.type === opts.type)
    .filter((n) => !layerIds || layerIds.has(n.id))
    .map((n) => {
      const d = n.data as Record<string, unknown>;
      const meta = ["use_when", "performs_best", "tags", "description", "applies_to"]
        .flatMap((k) => (Array.isArray(d[k]) ? (d[k] as string[]) : typeof d[k] === "string" ? [d[k] as string] : []))
        .join(" ");
      const score = overlap(q, `${n.id} ${title(n)}`) * 3 + overlap(q, meta) * 2 + overlap(q, n.body);
      return { id: n.id, type: n.data.type, title: title(n), score };
    })
    .filter((h) => h.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.limit ?? 10);
}

export function title(n: Note): string {
  return n.data.title ?? n.id;
}

const EXCERPT_MAX = 120;

function clip(text: string): string {
  const clean = text
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, "$2")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/[*_`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > EXCERPT_MAX ? `${clean.slice(0, EXCERPT_MAX - 1).trimEnd()}…` : clean;
}

/** One-line teaser: a tech note's first `use_when`, else the first body line that is not a heading. */
export function excerpt(n: Note): string | undefined {
  const useWhen = n.data.type === "tech" ? (n.data as TechData).use_when?.[0] : undefined;
  if (useWhen?.trim()) return clip(useWhen);
  let fenced = false;
  for (const raw of n.body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("```")) {
      fenced = !fenced;
      continue;
    }
    if (fenced || !line || line.startsWith("#") || /^(-{3,}|\*{3,})$/.test(line)) continue;
    const text = clip(line.replace(/^([-*+]|\d+\.)\s+/, "").replace(/^>\s*/, ""));
    if (text) return text;
  }
  return undefined;
}

/** Compact list entries sorted by type then title. */
export function listNotes(vault: Vault, opts: { type?: NoteType; layer?: string } = {}): NoteSummary[] {
  const layerId = opts.layer ? toId(opts.layer) : undefined;
  return [...vault.notes.values()]
    .filter((n) => !opts.type || n.data.type === opts.type)
    .map((n) => {
      const tech = n.data.type === "tech" ? (n.data as TechData) : undefined;
      return {
        id: n.id,
        type: n.data.type,
        title: title(n),
        layers: tech ? [tech.layer].flat().map(toId) : [],
        kind: tech?.kind,
        source: n.data.source,
        updated: n.data.updated,
        tags: n.data.tags ?? [],
        excerpt: excerpt(n),
      };
    })
    .filter((n) => !layerId || n.layers.includes(layerId))
    .sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title));
}

const RECENT_LIMIT = 6;

/** Frontmatter `updated`, else the file's mtime, so notes written outside the UI still rank. */
function updatedAt(note: Note): string {
  if (note.data.updated) return note.data.updated;
  try {
    return fs.statSync(note.path).mtime.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

/** Vault shape for the Home screen: type counts, inbox depth, broken links, orphans, latest edits. */
export function vaultStats(vault: Vault): VaultStats {
  const notes = [...vault.notes.values()];
  const counts = Object.fromEntries(NOTE_TYPES.map((type) => [type, 0])) as Record<NoteType, number>;
  for (const note of notes) counts[note.data.type] += 1;

  const brokenLinks = notes.flatMap((note) => note.links.filter((target) => !vault.notes.has(target)).map((to) => ({ from: note.id, to })));
  const orphans = notes.filter((note) => note.links.length === 0 && vault.getBacklinks(note.id).length === 0).map((n) => n.id);
  const summaries = new Map(listNotes(vault).map((summary) => [summary.id, summary]));
  const recent = notes
    .map((note) => ({ summary: summaries.get(note.id), updated: updatedAt(note) }))
    .filter((entry): entry is { summary: NoteSummary; updated: string } => Boolean(entry.summary))
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, RECENT_LIMIT)
    .map((entry) => ({ ...entry.summary, updated: entry.updated }));

  return { counts, total: notes.length, inbox: vault.listProposals().length, brokenLinks, orphans, recent };
}

/** Full note payload with a path relative to the vault root. */
export function toDetail(vault: Vault, note: Note): NoteDetail {
  return {
    id: note.id,
    type: note.data.type,
    data: note.data,
    body: note.body,
    links: note.links,
    backlinks: vault.getBacklinks(note.id),
    hash: note.hash,
    path: path.relative(vault.root, note.path).replace(/\\/g, "/"),
  };
}

function withoutUpdated(data: NoteData): NoteData {
  const copy: Record<string, unknown> = { ...data };
  delete copy.updated;
  return copy as NoteData;
}

/** Proposal plus the current note and both serialized texts for diffing (no `updated` line). */
export function proposalDetail(vault: Vault, p: Proposal): ProposalDetail {
  const current = vault.get(p.id);
  return {
    id: p.id,
    meta: p.meta,
    data: p.data,
    body: p.body,
    proposedText: serializeNote(withoutUpdated(p.data), p.body),
    current: current
      ? {
          data: current.data,
          body: current.body,
          hash: current.hash,
          text: serializeNote(withoutUpdated(current.data), current.body),
        }
      : null,
  };
}

export interface Candidate {
  id: string;
  kind: TechData["kind"];
  score: number;
  matched_use_when: string[];
  matched_performs_best: string[];
  matched_avoid_when: string[];
}

export interface Recommendation {
  description: string;
  profiles: { id: string; score: number; stack: Record<string, string[]> }[];
  layers: Record<string, Candidate[]>;
  note: string;
}

/**
 * Keyword-based shortlist. Deliberately simple: it gives the agent ranked candidates
 * plus the reasons they matched; the agent makes the final judgement.
 */
export function recommend(vault: Vault, description: string, opts: { layers?: string[]; perLayer?: number } = {}): Recommendation {
  const q = new Set(tokens(description));
  const hits = (phrases: string[]) => phrases.filter((p) => overlap(q, p) > 0);
  const layerIds = opts.layers?.map(toId) ?? vault.byType("layer").map((n) => n.id);

  const layers: Record<string, Candidate[]> = {};
  for (const layer of layerIds) {
    layers[layer] = vault
      .techInLayer(layer)
      .map((n) => {
        const d = n.data as TechData;
        const use = hits(d.use_when);
        const best = hits(d.performs_best);
        const avoid = hits(d.avoid_when);
        const score = use.length * 3 + best.length * 2 + overlap(q, [...d.tags, n.id].join(" ")) - avoid.length * 4;
        return { id: n.id, kind: d.kind, score, matched_use_when: use, matched_performs_best: best, matched_avoid_when: avoid };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, opts.perLayer ?? 3);
  }

  const profiles = vault
    .byType("profile")
    .map((n) => {
      const d = n.data as Extract<NoteData, { type: "profile" }>;
      const score = hits(d.use_when).length * 3 + overlap(q, `${d.description ?? ""} ${d.tags.join(" ")}`);
      return { id: n.id, score, stack: d.stack };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score);

  return {
    description,
    profiles,
    layers,
    note: "Scores are keyword overlap only. Read candidate notes (get_note) and decide; negative scores matched avoid_when.",
  };
}

/** Resolve tech ids plus their languages, then collect linked practices and checks. */
export function stackContext(vault: Vault, techIds: string[]) {
  const techs = new Map<string, Note>();
  const addTech = (id: string) => {
    const n = vault.get(id);
    if (n?.data.type !== "tech" || techs.has(n.id)) return;
    techs.set(n.id, n);
    if (n.data.language) addTech(n.data.language);
  };
  techIds.forEach(addTech);

  const collect = (type: "practice" | "check", field: "practices" | "checks") => {
    const out = new Map<string, Note>();
    for (const t of techs.values()) {
      for (const ref of (t.data as TechData)[field]) {
        const n = vault.get(ref);
        if (n) out.set(n.id, n);
      }
    }
    for (const n of vault.byType(type)) {
      const applies = (n.data as { applies_to: string[] }).applies_to.map(toId);
      if (applies.some((a) => techs.has(a))) out.set(n.id, n);
    }
    return [...out.values()];
  };

  return {
    missing: techIds.filter((id) => !vault.get(id)),
    techs: [...techs.values()],
    practices: collect("practice", "practices"),
    checks: collect("check", "checks"),
  };
}

// Note bodies sit under a "###" heading, so push their own headings below it.
const demote = (md: string) => md.replace(/^(#{1,3}) /gm, "###$1 ");

/** Markdown bundle an agent (or a project's STACK.md) can consume directly. */
export function renderContext(vault: Vault, techIds: string[]): string {
  const ctx = stackContext(vault, techIds);
  const section = (heading: string, notes: Note[], extra?: (n: Note) => string) =>
    notes.length
      ? `## ${heading}\n\n${notes.map((n) => `### ${title(n)} (\`${n.id}\`)\n\n${extra?.(n) ?? ""}${demote(n.body)}\n`).join("\n")}`
      : "";
  const techMeta = (n: Note) => {
    const d = n.data as TechData;
    const lines = [
      `- layer: ${[d.layer].flat().join(", ")}`,
      d.use_when.length && `- use when: ${d.use_when.join("; ")}`,
      d.avoid_when.length && `- avoid when: ${d.avoid_when.join("; ")}`,
    ].filter(Boolean);
    return `${lines.join("\n")}\n\n`;
  };
  const checkMeta = (n: Note) => {
    const d = n.data as Extract<NoteData, { type: "check" }>;
    return `- kind: ${d.kind}${d.command ? `\n- run: \`${d.command}\`` : ""}\n\n`;
  };
  return [
    `# Stack context`,
    ctx.missing.length ? `> Unknown in vault: ${ctx.missing.join(", ")}` : "",
    section("Technologies", ctx.techs, techMeta),
    section("Best practices", ctx.practices),
    section("Checks (validate generated code against these)", ctx.checks, checkMeta),
  ]
    .filter(Boolean)
    .join("\n\n");
}
