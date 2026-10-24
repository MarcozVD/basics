import { z } from "zod";

export const NOTE_TYPES = ["layer", "tech", "practice", "check", "profile", "project"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

// Folder each note type lives in, relative to the vault root.
export const TYPE_DIRS: Record<NoteType, string> = {
  layer: "layers",
  tech: "tech",
  practice: "practices",
  check: "checks",
  profile: "profiles",
  project: "projects",
};

const list = z.array(z.string()).default([]);

// Loose so unknown frontmatter fields survive a parse/round-trip; `.extend()` keeps the mode.
const base = z
  .object({
    title: z.string().optional(),
    tags: list,
    // "manual" for human-written notes, "agent:<name>" for notes approved from the inbox.
    source: z.string().default("manual").describe('"manual" for human-written notes, "agent:<name>" for notes approved from the inbox.'),
    updated: z.string().optional(),
  })
  .loose();

export const layerSchema = base.extend({
  type: z.literal("layer"),
  description: z.string().optional(),
});

export const techSchema = base.extend({
  type: z.literal("tech"),
  kind: z.enum(["language", "framework", "library", "tool", "service", "database"]),
  layer: z.union([z.string(), z.array(z.string())]),
  language: z.string().optional(),
  // Version of the tech the user's notes target, e.g. "19" or "2.7".
  version: z.string().optional().describe('Version of the tech the user\'s notes target, e.g. "19" or "2.7".'),
  // Package names that identify this tech in manifests.
  packages: z.object({ npm: list, pypi: list }).partial().optional().describe("Package names that identify this tech in manifests."),
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
  // Version range the note is valid for: since inclusive, until exclusive.
  since: z.string().optional().describe("Start of the version range the note is valid for (inclusive)."),
  until: z.string().optional().describe("End of the version range the note is valid for (exclusive)."),
});

export const checkSchema = base.extend({
  type: z.literal("check"),
  applies_to: list,
  kind: z.enum(["test", "lint", "review", "build"]).default("test"),
  // Optional shell command an agent can run to perform the check.
  command: z.string().optional().describe("Optional shell command an agent can run to perform the check."),
  since: z.string().optional().describe("Start of the version range the check is valid for (inclusive)."),
  until: z.string().optional().describe("End of the version range the check is valid for (exclusive)."),
});

export const profileSchema = base.extend({
  type: z.literal("profile"),
  description: z.string().optional(),
  use_when: list,
  // layer id -> list of tech ids
  stack: z.record(z.string(), z.array(z.string())).default({}).describe("layer id -> list of tech ids"),
});

export const checkStatusSchema = z.enum(["pass", "fail", "skip", "untrusted"]);
export type CheckStatus = z.infer<typeof checkStatusSchema>;

export const lastCheckSchema = z.object({
  status: checkStatusSchema,
  at: z.string(),
  duration_ms: z.number().optional(),
  output_tail: z.string().optional(),
});
export type LastCheck = z.infer<typeof lastCheckSchema>;

export const projectSchema = base.extend({
  type: z.literal("project"),
  description: z.string().optional(),
  // Absolute path of the project on disk.
  path: z.string().optional().describe("Absolute path of the project on disk."),
  status: z.enum(["active", "paused", "archived"]).default("active"),
  // Profile id it started from.
  profile: z.string().optional().describe("Profile id it started from."),
  // layer id -> tech ids
  stack: z.record(z.string(), z.array(z.string())).default({}).describe("layer id -> tech ids"),
  reason: z.string().optional(),
  // Short learnings for the vault.
  lessons: list.describe("Short learnings for the vault."),
  // Results of the last `basics check` run, keyed by check id.
  last_checks: z.record(z.string(), lastCheckSchema).optional().describe("Results of the last `basics check` run, keyed by check id."),
});

export const noteSchema = z.discriminatedUnion("type", [
  layerSchema,
  techSchema,
  practiceSchema,
  checkSchema,
  profileSchema,
  projectSchema,
]);

/** JSON Schema per note type, for generated reference docs. */
export function noteJsonSchemas(): Record<NoteType, Record<string, unknown>> {
  return {
    layer: z.toJSONSchema(layerSchema) as Record<string, unknown>,
    tech: z.toJSONSchema(techSchema) as Record<string, unknown>,
    practice: z.toJSONSchema(practiceSchema) as Record<string, unknown>,
    check: z.toJSONSchema(checkSchema) as Record<string, unknown>,
    profile: z.toJSONSchema(profileSchema) as Record<string, unknown>,
    project: z.toJSONSchema(projectSchema) as Record<string, unknown>,
  };
}

export type NoteData = z.infer<typeof noteSchema>;
export type TechData = z.infer<typeof techSchema>;

export const proposalMetaSchema = z.object({
  action: z.enum(["create", "update"]),
  proposed_by: z.string(),
  reason: z.string(),
  created: z.string(),
  // Hash of the note when the proposal was created. Approval refuses to
  // overwrite a note that changed in the meantime.
  base_hash: z.string().optional(),
});
export type ProposalMeta = z.infer<typeof proposalMetaSchema>;

export interface Note {
  id: string;
  path: string;
  data: NoteData;
  body: string;
  // Outgoing link targets (frontmatter references + [[wikilinks]] in body).
  links: string[];
  // sha256 hex of the raw file content, for conflict detection on write.
  hash: string;
}

export interface Proposal {
  id: string;
  path: string;
  meta: ProposalMeta;
  data: NoteData;
  body: string;
}
