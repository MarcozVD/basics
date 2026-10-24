import fs from "node:fs";
import path from "node:path";
import type { GraphData, GraphEdge, GraphNode, NoteDetail, NoteSummary, ProposalDetail, VaultStats } from "./api.js";
import { inRange } from "./detect.js";
import type { Embedder } from "./embeddings.js";
import { phraseParts, splitNegations } from "./negation.js";
import { NOTE_TYPES, type Note, type NoteData, type NoteType, type Proposal, type TechData } from "./schema.js";
import { expandSynonyms } from "./synonyms.js";
import { firstParagraph, idf, tokens } from "./tokens.js";
import { serializeNote, toId, type Vault } from "./vault.js";
import type { LoadedIndex } from "./vector-index.js";

export { tokens };

/**
 * IDF weighting is what makes "app" or "datos" count little and "ssr" or "playwright" count a lot.
 * Scores stay integers: raw IDF is multiplied by 10 and rounded, with a floor of 4 so a very
 * common token still scores something.
 */
const IDF_SCALE = 10;
const IDF_FLOOR = 4;

/** A token matched only through the synonym map counts less than a direct hit. */
const SYNONYM_WEIGHT = 0.6;

const NAME_W = 5;
/** `use_when` is the situation the tech is for; the strongest field after the tech's own name. */
const USE_W = 3;
/** A matched `avoid_when` is an explicit "not this": it outweighs `use_when` and sinks the tech. */
const AVOID_W = 4;
/** Tags are well-chosen labels and the main signal for notes with no `use_when`. */
const TAG_W = 2.75;
/** `performs_best` and the body corroborate the match but, alone, do not make a top-3 tech. */
const BEST_W = 1.5;
const BODY_W = 0.75;
/** A negated query span meeting the note's own negation ("sin contraseña") weighs like `use_when`. */
const NEG_W = 3;

interface MatchScore {
  /** Weighted direct hits (part of `keywords`/`text`/`synonyms` in the breakdown). */
  direct: number;
  /** Points won only through the synonym map. */
  synonyms: number;
}

function tokenWeight(token: string, idfWeights: Map<string, number>): number {
  return Math.max(IDF_FLOOR, Math.round((idfWeights.get(token) ?? 1) * IDF_SCALE));
}

/** Count each matched query/synonym token once, weighted by rarity, scaled by the field weight. */
function fieldScore(query: Set<string>, extra: Set<string>, text: string, idfWeights: Map<string, number>, weight: number): MatchScore {
  const seen = new Set<string>();
  let direct = 0;
  let synonym = 0;
  for (const token of tokens(text)) {
    if (seen.has(token)) continue;
    seen.add(token);
    if (query.has(token)) direct += tokenWeight(token, idfWeights);
    else if (extra.has(token)) synonym += tokenWeight(token, idfWeights);
  }
  return { direct: Math.round(weight * direct), synonyms: Math.round(SYNONYM_WEIGHT * weight * synonym) };
}

/** True when two name tokens denote the same technology ("postgres" ~ "postgresql"). */
function alias(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  return a.startsWith(b) || b.startsWith(a);
}

/** Raw name words (stems), lowercased and split on every separator, without stemming. */
function nameParts(names: string): string[] {
  return names
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9+#]+/)
    .filter(Boolean);
}

/**
 * The id/title/packages field. Real names are full words with prefixes that the stemmer would
 * mangle ("openid" -> "open", "postgresql" -> "postgr"), so this keeps raw name words and matches
 * a query token when it equals or prefixes one (plus "postgres"/"postgresql"-style aliases).
 */
function nameScore(query: Set<string>, extra: Set<string>, names: string, idfWeights: Map<string, number>, weight: number): MatchScore {
  const present = [...new Set(nameParts(names))];
  const direct = new Set<string>();
  const synonym = new Set<string>();
  for (const token of query) if (present.some((name) => alias(name, token))) direct.add(token);
  for (const token of extra) if (!direct.has(token) && present.some((name) => alias(name, token))) synonym.add(token);
  const sum = (tokensIn: Set<string>) => [...tokensIn].reduce((total, token) => total + tokenWeight(token, idfWeights), 0);
  return { direct: Math.round(weight * sum(direct)), synonyms: Math.round(SYNONYM_WEIGHT * weight * sum(synonym)) };
}

function overlap(query: Set<string>, text: string): number {
  return tokens(text).filter((t) => query.has(t)).length;
}

/** The affirmative part of each phrase: "API pura sin interfaz" -> "api pura". */
function affirmative(phrases: string[]): string {
  return phrases.map((phrase) => phraseParts(phrase).positive).join(" ");
}

/**
 * Rarity-weighted tokens shared by a note's negated text and the query's negated spans. A negated
 * span meeting the note's own negation ("sin contraseña" ~ "… sin contraseña") is as informative
 * as a positive overlap, so it is scored with the same rarity scaling.
 */
function negatedOverlap(texts: string[], spans: Set<string>[], idfWeights: Map<string, number>): number {
  const present = new Set(texts.flatMap((text) => tokens(text)));
  const seen = new Set<string>();
  let sum = 0;
  for (const span of spans) {
    for (const token of span) {
      if (!present.has(token) || seen.has(token)) continue;
      seen.add(token);
      sum += tokenWeight(token, idfWeights);
    }
  }
  return sum;
}

/** Vocabulary shared by every tech, used to weight rare tokens higher; includes tags and use_when. */
function vaultIdf(vault: Vault): Map<string, number> {
  return idf(
    vault.byType("tech").map((note) => {
      const d = note.data as TechData;
      const packages = Object.values(d.packages ?? {}).flat();
      return [
        ...nameParts([note.id, title(note), packages.join(" ")].join(" ")),
        ...tokens(d.tags.join(" ")),
        ...tokens(d.use_when.join(" ")),
        ...tokens(d.performs_best.join(" ")),
        ...tokens(firstParagraph(note.body)),
      ];
    }),
  );
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
        project: n.data.type === "project" ? n.data : undefined,
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
  const groupOf = (note: Note): string | undefined => {
    const data = note.data;
    if (data.type === "tech") return [data.layer].flat().map(toId)[0];
    if (data.type !== "practice" && data.type !== "check") return undefined;
    // A practice/check belongs to a layer only when every tech it applies to does.
    const groups = new Set(
      data.applies_to.map((id) => {
        const target = vault.get(toId(id));
        return target?.data.type === "tech" ? [target.data.layer].flat().map(toId)[0] : undefined;
      }),
    );
    return groups.size === 1 ? [...groups][0] : undefined;
  };
  const groups = new Map([...vault.notes.values()].map((note) => [note.id, groupOf(note)] as const));
  const nodes: GraphNode[] = listNotes(vault).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    layers: n.layers,
    group: groups.get(n.id),
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
  /** Every part adds up to `score`; `synonyms` counts points won only through the synonym map. */
  score_breakdown: { keywords: number; text: number; synonyms: number; negation: number; language: number; semantic?: number };
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
  /**
   * Return a score for every tech in each requested layer, even ones with no keyword signal.
   * `recommendHybrid` uses it because a strong semantic match with no keyword agreement is still
   * a legitimate recommendation in hybrid mode; keyword mode never sets it.
   */
  includeUnscored?: boolean;
}

/** Profile matching for the "start from a profile" card: `use_when`, description and tags. */
function scoreProfiles(vault: Vault, description: string): { id: string; score: number; stack: Record<string, string[]> }[] {
  const { positive } = splitNegations(description);
  const q = new Set(tokens(positive));
  const syn = expandSynonyms(q);
  const idfWeights = vaultIdf(vault);
  return vault
    .byType("profile")
    .map((n) => {
      const d = n.data as Extract<NoteData, { type: "profile" }>;
      const score = fieldScore(q, syn, [...d.use_when, d.description ?? "", ...d.tags].join(" "), idfWeights, USE_W);
      return { id: n.id, score: score.direct + score.synonyms, stack: d.stack };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Keyword-based shortlist. Deliberately simple: it gives the agent ranked candidates
 * plus the reasons they matched; the agent makes the final judgement.
 */
export function recommend(vault: Vault, description: string, opts: RecommendOptions = {}): Recommendation {
  const { positive, negated } = splitNegations(description);
  const q = new Set(tokens(positive));
  const syn = expandSynonyms(q);
  const idfWeights = vaultIdf(vault);
  const layerIds = opts.layers?.map(toId) ?? vault.byType("layer").map((n) => n.id);

  // Positive query terms only match the affirmative part of a phrase ("API pura" in
  // "API pura sin interfaz"), so mentioning "interfaz" doesn't count as that avoid_when.
  const hits = (phrases: string[]) =>
    phrases.filter((p) => {
      const parts = phraseParts(p);
      return overlap(q, parts.positive) > 0 || overlap(syn, parts.positive) > 0;
    });
  // `avoid_when` stays conservative: synonyms must not trip a penalty the user never meant.
  const directHits = (phrases: string[]) => phrases.filter((p) => overlap(q, phraseParts(p).positive) > 0);

  // A negated query span keeps or flips polarity depending on which part of the phrase it
  // hits: "sin interfaz" vs avoid_when "API pura sin interfaz" is the same situation.
  // Negation stays direct-only, like the avoid_when penalty, so a synonym never flips polarity.
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
    return [...tokens(n.id), ...tokens(title(n))].some((t) => q.has(t) || syn.has(t));
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
        const avoid = directHits(d.avoid_when);
        const negUse = negatedHits(d.use_when);
        const negAvoid = negatedHits(d.avoid_when);
        const packages = Object.values(d.packages ?? {}).flat();
        // Naming the tech is strong evidence, but a language is never a candidate just because it is
        // named: its boost only breaks ties among techs that already match on `use_when`/`tags`.
        const nameSig =
          d.kind === "language"
            ? { direct: 0, synonyms: 0 }
            : nameScore(q, syn, [n.id, title(n), packages.join(" ")].join(" "), idfWeights, NAME_W);
        // A negated tail describes a property the user wants, not an affirmative claim ("API pura
        // sin interfaz" is not "interfaz"), so every field reads only its affirmative part.
        const useSig = fieldScore(q, syn, affirmative(d.use_when), idfWeights, USE_W);
        const bestSig = fieldScore(q, syn, affirmative(d.performs_best), idfWeights, BEST_W);
        const tagSig = fieldScore(q, syn, d.tags.join(" "), idfWeights, TAG_W);
        const bodySig = fieldScore(q, syn, firstParagraph(n.body), idfWeights, BODY_W);
        const avoidSig = fieldScore(q, new Set(), affirmative(d.avoid_when), idfWeights, AVOID_W);
        const keywords = nameSig.direct + useSig.direct + bestSig.direct;
        const text = tagSig.direct + bodySig.direct;
        const synonyms = nameSig.synonyms + useSig.synonyms + bestSig.synonyms + tagSig.synonyms + bodySig.synonyms;
        // Same polarity: a negated query span meets the note's own negation ("sin contraseña" ~
        // "… sin contraseña") — a strong match. Opposite polarity: it meets the note's affirmative
        // text ("sin login" vs "login") — a penalty. `avoid_when` is excluded: a negated phrase
        // there ("pure API without a UI") marks a situation to avoid, not a positive property.
        const negatedTexts = [...d.use_when.map((p) => phraseParts(p).negated), ...d.tags.map((t) => phraseParts(t).negated)].filter(
          (part): part is string => Boolean(part),
        );
        const negation = Math.round(
          NEG_W *
            (negatedOverlap(negatedTexts, negatedTokenSets, idfWeights) -
              negatedOverlap([affirmative(d.use_when)], negatedTokenSets, idfWeights)),
        );
        const language = languageBoost(d);
        // There must be a positive signal before the language boost or negation can rank a tech.
        const signal = keywords + text + synonyms + negation;
        return {
          id: n.id,
          kind: d.kind,
          score: signal + language - avoidSig.direct,
          hasSignal: signal > 0,
          matched_performs_best: best,
          matched_use_when: [...new Set([...use, ...negUse.same])],
          matched_avoid_when: [...new Set([...avoid, ...negAvoid.same])],
          negated_use_when: negUse.opposite,
          negated_avoid_when: negAvoid.opposite,
          language_boost: language,
          score_breakdown: { keywords, text, synonyms, negation, language },
        };
      })
      .filter((candidate) => opts.includeUnscored || (candidate.hasSignal && candidate.score > 0))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .map(({ hasSignal, ...candidate }) => candidate)
      .slice(0, opts.perLayer ?? 3);
  }

  const profiles = scoreProfiles(vault, description).filter((p) => p.score > 0);

  return {
    description,
    profiles,
    layers,
    note: "Scores combine a curated ES/EN synonym map with weighted keyword overlap: naming the tech, its use_when, its tags and its first paragraph, all scaled by how rare each word is in your vault; explicit negations and language fit adjust the total. score_breakdown shows every part, and per_layer is a maximum, not a minimum: a layer with nothing above zero returns an empty list. Read candidate notes (get_note) and decide.",
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

/**
 * Fused score below which a candidate is dropped: `SEMANTIC_FLOOR` maps to 0 on the calibrated
 * scale, so a candidate with no keyword signal and a similarity at or below `SEMANTIC_FLOOR`
 * (0.80) yields exactly 0 and is not a recommendation. The floor is not raised further on purpose:
 * the embedding band is narrow (SEMANTIC_FLOOR..SEMANTIC_CEIL) and 0.5-weight semantics can carry
 * a genuinely relevant tech that keyword scoring missed.
 */
export const HYBRID_SCORE_FLOOR = 0;

/**
 * Similarity at or above which a tech the keyword pass dropped (no keyword signal at all) is
 * offered anyway. Plain `SEMANTIC_FLOOR` would re-add every weakly similar tech in the vault;
 * requiring most of the calibrated band keeps only clearly relevant ones.
 */
export const HYBRID_SEMANTIC_ONLY = 0.5;

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

  // Every tech is scored, not just keyword hits: in hybrid mode a strong semantic match with no
  // keyword signal is a legitimate recommendation. `score_breakdown` shows which part (if any) it won.
  const keyword = recommend(vault, description, { layers: opts.layers, perLayer: Number.MAX_SAFE_INTEGER, includeUnscored: true });
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
    const keywords = scaleKeywords(candidates.map((candidate) => Math.max(0, candidate.score)));
    const semantics = semantic.map(semantic01);
    layers[layer] = candidates
      .map((candidate, i) => ({
        ...candidate,
        hybrid: round3(weight * keywords[i] + (1 - weight) * semantics[i]),
        score_breakdown: { ...candidate.score_breakdown, semantic: round3(semantics[i]) },
      }))
      // Keep a candidate with keyword signal, or one whose similarity alone is clearly relevant.
      .filter((candidate) => candidate.score > 0 || semantics[candidates.indexOf(candidate)] >= HYBRID_SEMANTIC_ONLY)
      .filter((candidate) => (candidate.hybrid ?? 0) > HYBRID_SCORE_FLOOR)
      .sort((a, b) => (b.hybrid ?? 0) - (a.hybrid ?? 0) || b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, opts.perLayer ?? 3);
  }

  // Profiles keep the same rule: keyword signal or a clearly relevant semantic match.
  const allProfiles = scoreProfiles(vault, description);
  const profileScores = allProfiles.map((profile) => cosine(queryVector, index.get(profile.id, "main")));
  const profileKeywords = scaleKeywords(allProfiles.map((profile) => Math.max(0, profile.score)));
  const profileSemantics = profileScores.map(semantic01);
  const profiles = allProfiles
    .map((profile, i) => ({ profile, i }))
    .filter(({ i }) => profileKeywords[i] > 0 || profileSemantics[i] >= HYBRID_SEMANTIC_ONLY)
    .map(({ profile, i }) => ({ ...profile, hybrid: round3(weight * profileKeywords[i] + (1 - weight) * profileSemantics[i]) }))
    .sort((a, b) => (b.hybrid ?? 0) - (a.hybrid ?? 0) || b.score - a.score || a.id.localeCompare(b.id));

  return {
    description,
    profiles,
    layers,
    note: "Scores fuse weighted keyword overlap (a curated ES/EN synonym map, naming/use_when/tags/first paragraph, scaled by word rarity) with local semantic similarity, minus explicit negations; candidates at or below the fused floor are dropped and per_layer is a maximum, not a minimum. score_breakdown shows every part. Read candidate notes (get_note) and decide.",
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
