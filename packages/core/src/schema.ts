import { z } from "zod";

export const NOTE_TYPES = ["layer", "tech", "practice", "check", "profile"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

// Folder each note type lives in, relative to the vault root.
export const TYPE_DIRS: Record<NoteType, string> = {
  layer: "layers",
  tech: "tech",
  practice: "practices",
  check: "checks",
  profile: "profiles",
};

const list = z.array(z.string()).default([]);

const base = z.object({
  title: z.string().optional(),
  tags: list,
  // "manual" for human-written notes, "agent:<name>" for notes approved from the inbox.
  source: z.string().default("manual"),
  updated: z.string().optional(),
});

export const layerSchema = base.extend({
  type: z.literal("layer"),
  description: z.string().optional(),
});

export const techSchema = base.extend({
  type: z.literal("tech"),
  kind: z.enum(["language", "framework", "library", "tool", "service", "database"]),
  layer: z.union([z.string(), z.array(z.string())]),
  language: z.string().optional(),
  use_when: list,
  avoid_when: list,
  performs_best: list,
  related: list,
  practices: list,
  checks: list,
});

export const practiceSchema = base.extend({
  type: z.literal("practice"),
  applies_to: list,
});

export const checkSchema = base.extend({
  type: z.literal("check"),
  applies_to: list,
  kind: z.enum(["test", "lint", "review", "build"]).default("test"),
  // Optional shell command an agent can run to perform the check.
  command: z.string().optional(),
});

export const profileSchema = base.extend({
  type: z.literal("profile"),
  description: z.string().optional(),
  use_when: list,
  // layer id -> list of tech ids
  stack: z.record(z.string(), z.array(z.string())).default({}),
});

export const noteSchema = z.discriminatedUnion("type", [layerSchema, techSchema, practiceSchema, checkSchema, profileSchema]);

export type NoteData = z.infer<typeof noteSchema>;
export type TechData = z.infer<typeof techSchema>;

export const proposalMetaSchema = z.object({
  action: z.enum(["create", "update"]),
  proposed_by: z.string(),
  reason: z.string(),
  created: z.string(),
});
export type ProposalMeta = z.infer<typeof proposalMetaSchema>;

export interface Note {
  id: string;
  path: string;
  data: NoteData;
  body: string;
  // Outgoing link targets (frontmatter references + [[wikilinks]] in body).
  links: string[];
}

export interface Proposal {
  id: string;
  path: string;
  meta: ProposalMeta;
  data: NoteData;
  body: string;
}
