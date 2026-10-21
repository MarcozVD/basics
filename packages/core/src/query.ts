import fs from "node:fs";
import path from "node:path";
import type { GraphData, GraphEdge, GraphNode, NoteDetail, NoteSummary, ProposalDetail, VaultStats } from "./api.js";
import { inRange } from "./detect.js";
import type { Embedder } from "./embeddings.js";
import { phraseParts, splitNegations } from "./negation.js";
import { NOTE_TYPES, type Note, type NoteData, type NoteType, type Proposal, type TechData } from "./schema.js";
import { serializeNote, toId, type Vault } from "./vault.js";
import type { LoadedIndex } from "./vector-index.js";

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

/**
 * Nodes and edges for the graph view. A link in both directions is one edge; links to
 * missing notes are dropped unless `broken` is set, then the targets become `missing` nodes.
 */
export function buildGraph(vault: Vault, opts: { broken?: boolean } = {}): GraphData {
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  const missing = new Set<string>();
  for (const note of vault.notes.values()) {
    for (const target of note.links) {
      if (target === note.id) continue;
      const exists = vault.notes.has(target);
      if (!exists && !opts.broken) continue;
      const key = note.id < target ? `${note.id}|${target}` : `${target}|${note.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!exists) missing.add(target);
      edges.push({ source: note.id, target, kind: exists ? "link" : "broken" });
    }
  }
  const degree = new Map<string, number>();
  for (const edge of edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }
  const nodes: GraphNode[] = listNotes(vault).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    layers: n.layers,
    degree: degree.get(n.id) ?? 0,
  }));
  for (const id of [...missing].sort()) nodes.push({ id, type: "missing", title: id, layers: [], degree: degree.get(id) ?? 0 });
  return { nodes, edges };
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
  negated_use_when: string[];
  negated_avoid_when: string[];
  language_boost: number;
  score_breakdown: { keywords: number; negation: number; language: number; semantic?: number };
  /** Fused 0–1 score; only present in hybrid mode. */
  hybrid?: number;
}

export interface Recommendation {
  description: string;
  profiles: { id: string; score: number; hybrid?: number; stack: Record<string, string[]> }[];
  layers: Record<string, Candidate[]>;
  note: string;
  mode: "keywords" | "hybrid";
}

/** Default fusion weight for the keyword score; the rest goes to semantics. */
export const HYBRID_WEIGHT = 0.4;
/** Penalty for a query that is semantically close to a tech's avoid_when text. */
export const HYBRID_LAMBDA = 1;
/** Similarity above which the avoid_when penalty starts. */
export const HYBRID_THETA = 0.85;
/** Penalty for a negated phrase being semantically close to a tech's positive text. */
export const HYBRID_MU = 0.5;
/**
 * e5 cosine similarities cluster in a narrow band, so they are mapped to 0..1 on a fixed
 * scale instead of per-layer min-max (which turns tiny gaps between 2-3 candidates into 0 vs 1).
 */
export const SEMANTIC_FLOOR = 0.8;
export const SEMANTIC_CEIL = 0.88;
/** Keyword score treated as a full match when a layer's best score is lower. */
export const KEYWORD_REFERENCE = 6;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/** Absolute 0..1 scale for a cosine similarity. */
export function calibrateSemantic(raw: number, floor = SEMANTIC_FLOOR, ceil = SEMANTIC_CEIL): number {
  return clamp01((raw - floor) / (ceil - floor));
}

/** Keyword scores over max(reference, best in the group); negatives become 0. */
export function scaleKeywords(scores: number[], reference = KEYWORD_REFERENCE): number[] {
  const top = Math.max(reference, ...scores);
  return scores.map((score) => clamp01(score / top));
}

function techLayers(d: TechData): string[] {
  return [d.layer].flat().map(toId);
}

export interface RecommendOptions {
  layers?: string[];
  perLayer?: number;
}

/**
 * Keyword-based shortlist. Deliberately simple: it gives the agent ranked candidates
 * plus the reasons they matched; the agent makes the final judgement.
 */
export function recommend(vault: Vault, description: string, opts: RecommendOptions = {}): Recommendation {
  const { positive, negated } = splitNegations(description);
  const q = new Set(tokens(positive));
  const layerIds = opts.layers?.map(toId) ?? vault.byType("layer").map((n) => n.id);

  // Positive query terms only match the affirmative part of a phrase ("API pura" in
  // "API pura sin interfaz"), so mentioning "interfaz" doesn't count as that avoid_when.
  const hits = (phrases: string[]) => phrases.filter((p) => overlap(q, phraseParts(p).positive) > 0);

  // A negated query span keeps or flips polarity depending on which part of the phrase it
  // hits: "sin interfaz" vs avoid_when "API pura sin interfaz" is the same situation.
  const negatedTokenSets = negated.map((span) => new Set(tokens(span)));
  const negatedHits = (phrases: string[]): { same: string[]; opposite: string[] } => {
    const same = new Set<string>();
    const opposite = new Set<string>();
    for (const span of negatedTokenSets) {
      for (const phrase of phrases) {
        const parts = phraseParts(phrase);
        if (parts.negated && overlap(span, parts.negated) > 0) same.add(phrase);
        else if (overlap(span, parts.positive) > 0) opposite.add(phrase);
      }
    }
    return { same: [...same], opposite: [...opposite] };
  };

  // Language techs named in the positive text: their implementation techs get a boost.
  const mentionedLanguages = vault.byType("tech").filter((n) => {
    const d = n.data as TechData;
    if (d.kind !== "language") return false;
    return [...tokens(n.id), ...tokens(title(n))].some((t) => q.has(t));
  });
  const languageBoost = (d: TechData): number => {
    const layers = techLayers(d);
    let boost = 0;
    for (const language of mentionedLanguages) {
      const same = d.language !== undefined && toId(d.language) === language.id;
      if (same) boost += 3;
      else if (d.language !== undefined && techLayers(language.data as TechData).some((l) => layers.includes(l))) boost -= 2;
    }
    return boost;
  };

  const layers: Record<string, Candidate[]> = {};
  for (const layer of layerIds) {
    layers[layer] = vault
      .techInLayer(layer)
      .map((n) => {
        const d = n.data as TechData;
        const use = hits(d.use_when);
        const best = hits(d.performs_best);
        const avoid = hits(d.avoid_when);
        const negUse = negatedHits(d.use_when);
        const negAvoid = negatedHits(d.avoid_when);
        const keywords = use.length * 3 + best.length * 2 + overlap(q, [...d.tags, n.id].join(" ")) - avoid.length * 4;
        // same polarity: negated use_when part = a use hit, negated avoid_when part = an avoid hit.
        // A phrase already counted by the positive text is not counted again.
        const useSame = negUse.same.filter((p) => !use.includes(p));
        const avoidSame = negAvoid.same.filter((p) => !avoid.includes(p));
        const negation = useSame.length * 3 - negUse.opposite.length * 3 - avoidSame.length * 4 + negAvoid.opposite.length * 2;
        const language = languageBoost(d);
        return {
          id: n.id,
          kind: d.kind,
          score: keywords + negation + language,
          matched_performs_best: best,
          matched_use_when: [...new Set([...use, ...negUse.same])],
          matched_avoid_when: [...new Set([...avoid, ...negAvoid.same])],
          negated_use_when: negUse.opposite,
          negated_avoid_when: negAvoid.opposite,
          language_boost: language,
          score_breakdown: { keywords, negation, language },
        };
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
    note: "Scores combine keyword overlap, explicit negations and language fit; score_breakdown shows each part. Read candidate notes (get_note) and decide.",
    mode: "keywords",
  };
}

/** Min-max scale to [0,1]; equal (or a single) values become 0.5. */
export function minMaxNormalize(scores: number[]): number[] {
  if (!scores.length) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return scores.map(() => 0.5);
  return scores.map((score) => (score - min) / (max - min));
}

function cosine(a: Float32Array | undefined, b: Float32Array | undefined): number {
  if (!a || !b) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return normA > 0 && normB > 0 ? dot / Math.sqrt(normA * normB) : 0;
}

const round3 = (value: number): number => Math.round(value * 1000) / 1000;

export interface HybridOptions extends RecommendOptions {
  /** Keyword weight, 0..1. */
  weight?: number;
  lambda?: number;
  theta?: number;
  mu?: number;
  floor?: number;
  ceil?: number;
}

/**
 * Fuse the keyword shortlist with local embedding similarity. Keyword scores stay on
 * `score`; the fused 0–1 value lands on `hybrid` and drives the ordering.
 */
export async function recommendHybrid(
  vault: Vault,
  description: string,
  index: LoadedIndex,
  embedder: Embedder,
  opts: HybridOptions = {},
): Promise<Recommendation> {
  const weight = opts.weight ?? HYBRID_WEIGHT;
  const lambda = opts.lambda ?? HYBRID_LAMBDA;
  const theta = opts.theta ?? HYBRID_THETA;
  const mu = opts.mu ?? HYBRID_MU;
  const semantic01 = (raw: number) => calibrateSemantic(raw, opts.floor, opts.ceil);

  const keyword = recommend(vault, description, { layers: opts.layers, perLayer: Number.MAX_SAFE_INTEGER });
  const { positive, negated } = splitNegations(description);
  const queryText = positive.trim() || description;
  const [queryVector, ...negatedVectors] = await embedder.embed([queryText, ...negated], "query");

  const layers: Record<string, Candidate[]> = {};
  for (const [layer, candidates] of Object.entries(keyword.layers)) {
    const semantic = candidates.map((candidate) => {
      const pos = index.get(candidate.id, "pos");
      const neg = index.get(candidate.id, "neg");
      const negatedPenalty = mu * negatedVectors.reduce((max, span) => Math.max(max, cosine(span, pos)), 0);
      const avoidPenalty = lambda * Math.max(0, cosine(queryVector, neg) - theta);
      return cosine(queryVector, pos) - avoidPenalty - negatedPenalty;
    });
    const keywords = scaleKeywords(candidates.map((candidate) => candidate.score));
    const semantics = semantic.map(semantic01);
    layers[layer] = candidates
      .map((candidate, i) => ({
        ...candidate,
        hybrid: round3(weight * keywords[i] + (1 - weight) * semantics[i]),
        score_breakdown: { ...candidate.score_breakdown, semantic: round3(semantics[i]) },
      }))
      .sort((a, b) => (b.hybrid ?? 0) - (a.hybrid ?? 0) || b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, opts.perLayer ?? 3);
  }

  const profileScores = keyword.profiles.map((profile) => cosine(queryVector, index.get(profile.id, "main")));
  const profileKeywords = scaleKeywords(keyword.profiles.map((profile) => profile.score));
  const profileSemantics = profileScores.map(semantic01);
  const profiles = keyword.profiles
    .map((profile, i) => ({
      ...profile,
      hybrid: round3(weight * profileKeywords[i] + (1 - weight) * profileSemantics[i]),
    }))
    .sort((a, b) => (b.hybrid ?? 0) - (a.hybrid ?? 0) || b.score - a.score || a.id.localeCompare(b.id));

  return {
    description,
    profiles,
    layers,
    note: "Scores fuse keyword overlap with local semantic similarity, minus explicit negations; score_breakdown shows each part. Read candidate notes (get_note) and decide.",
    mode: "hybrid",
  };
}

/** Resolve tech ids plus their languages, then collect linked practices and checks. */
export function stackContext(vault: Vault, techIds: string[], opts: { versions?: Record<string, string> } = {}) {
  const techs = new Map<string, Note>();
  const addTech = (id: string) => {
    const n = vault.get(id);
    if (n?.data.type !== "tech" || techs.has(n.id)) return;
    techs.set(n.id, n);
    if (n.data.language) addTech(n.data.language);
  };
  techIds.forEach(addTech);

  const versions = opts.versions ?? {};
  const keep = (n: Note, field: "practices" | "checks"): boolean => {
    const data = n.data as { applies_to: string[]; since?: string; until?: string };
    const applies = new Set(data.applies_to.map(toId));
    for (const t of techs.values()) {
      if ((t.data as TechData)[field].map(toId).includes(n.id)) applies.add(t.id);
    }
    const versioned = [...applies].filter((id) => techs.has(id) && versions[id] !== undefined);
    if (!versioned.length) return true;
    return versioned.some((id) => inRange(versions[id], data.since, data.until));
  };
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
    return [...out.values()].filter((n) => keep(n, field));
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
export function renderContext(vault: Vault, techIds: string[], opts: { versions?: Record<string, string> } = {}): string {
  const ctx = stackContext(vault, techIds, opts);
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
