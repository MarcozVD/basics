import type { NoteData, NoteType } from "@marcozvd/basics-core";

/** Fields whose value already exists for provenance or is maintained by the vault. */
const IGNORED_FIELDS = new Set(["type", "tags", "source", "updated"]);

/** Reading order for field changes, so summaries stay stable across proposals. */
const FIELD_ORDER = [
  "title",
  "kind",
  "layer",
  "language",
  "version",
  "description",
  "status",
  "profile",
  "path",
  "use_when",
  "avoid_when",
  "performs_best",
  "related",
  "practices",
  "checks",
  "applies_to",
  "since",
  "until",
  "command",
  "stack",
  "reason",
  "lessons",
  "last_checks",
];

export type SummaryChange =
  | { kind: "tags"; action: "add" | "remove"; values: string[] }
  | { kind: "section"; action: "add" | "remove"; values: string[] }
  | { kind: "field"; field: string }
  | { kind: "body" };

export interface ProposalSummary {
  create: boolean;
  type: NoteType;
  /** Display layer for a created note, when the note type belongs to one. */
  layer?: string;
  changes: SummaryChange[];
}

function record(data: NoteData): Record<string, unknown> {
  return data as unknown as Record<string, unknown>;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
  }
  return JSON.stringify(left) === JSON.stringify(right);
}

function headings(body: string): string[] {
  return body
    .split(/\r?\n/)
    .map((line) => /^#{1,6}\s+(.+?)\s*$/.exec(line)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
}

function addedValues(before: readonly string[], after: readonly string[]): string[] {
  const existing = new Set(before);
  return after.filter((value) => !existing.has(value));
}

/** The layer note's own title, or the raw id when the vault has no layer data. */
function createLayer(data: NoteData, layerTitles?: ReadonlyMap<string, string>): string | undefined {
  if (data.type !== "tech") return undefined;
  const layer = data.layer;
  const first = Array.isArray(layer) ? layer[0] : layer;
  if (!first) return undefined;
  return layerTitles?.get(first) || first;
}

/**
 * Describe a proposal from its parsed data, never by re-reading the serialized text.
 * The caller caps the list; the order is what reads best: tags, sections, fields, body.
 * `layerTitles` maps layer ids to their note titles so Spanish vaults read "Datos".
 */
export function summarizeProposal(
  before: NoteData | null,
  after: NoteData,
  beforeBody = "",
  afterBody = "",
  layerTitles?: ReadonlyMap<string, string>,
): ProposalSummary {
  if (!before) {
    return { create: true, type: after.type, layer: createLayer(after, layerTitles), changes: [] };
  }

  const changes: SummaryChange[] = [];
  const beforeRecord = record(before);
  const afterRecord = record(after);

  const addedTags = addedValues(before.tags, after.tags);
  const removedTags = addedValues(after.tags, before.tags);
  if (addedTags.length > 0) changes.push({ kind: "tags", action: "add", values: addedTags });
  if (removedTags.length > 0) changes.push({ kind: "tags", action: "remove", values: removedTags });

  const beforeHeadings = headings(beforeBody);
  const afterHeadings = headings(afterBody);
  const addedSections = addedValues(beforeHeadings, afterHeadings);
  const removedSections = addedValues(afterHeadings, beforeHeadings);
  if (addedSections.length > 0) changes.push({ kind: "section", action: "add", values: addedSections });
  if (removedSections.length > 0) changes.push({ kind: "section", action: "remove", values: removedSections });

  const keys = new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)]);
  const ordered = [...FIELD_ORDER.filter((key) => keys.has(key)), ...[...keys].filter((key) => !FIELD_ORDER.includes(key)).sort()];
  for (const key of ordered) {
    if (IGNORED_FIELDS.has(key)) continue;
    if (sameValue(beforeRecord[key], afterRecord[key])) continue;
    changes.push({ kind: "field", field: key });
  }

  if (beforeBody.trimEnd() !== afterBody.trimEnd() && addedSections.length === 0 && removedSections.length === 0) {
    changes.push({ kind: "body" });
  }

  return { create: false, type: after.type, changes };
}
