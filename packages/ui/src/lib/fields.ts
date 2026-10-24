import type { NoteData, NoteType } from "@marcozvd/basics-core";

export type Field = {
  key: string;
  kind: "text" | "textarea" | "enum" | "list" | "links" | "link" | "stack";
  options?: string[];
  linkType?: NoteType;
};

const common: Field[] = [
  { key: "title", kind: "text" },
  { key: "tags", kind: "list" },
];

export const FIELDS: Record<NoteType, Field[]> = {
  layer: [...common, { key: "description", kind: "textarea" }],
  tech: [
    ...common,
    { key: "kind", kind: "enum", options: ["language", "framework", "library", "tool", "service", "database"] },
    { key: "layer", kind: "links", linkType: "layer" },
    { key: "language", kind: "link", linkType: "tech" },
    { key: "version", kind: "text" },
    { key: "use_when", kind: "list" },
    { key: "avoid_when", kind: "list" },
    { key: "performs_best", kind: "list" },
    { key: "related", kind: "links", linkType: "tech" },
    { key: "practices", kind: "links", linkType: "practice" },
    { key: "checks", kind: "links", linkType: "check" },
  ],
  practice: [
    ...common,
    { key: "applies_to", kind: "links", linkType: "tech" },
    { key: "since", kind: "text" },
    { key: "until", kind: "text" },
  ],
  check: [
    ...common,
    { key: "kind", kind: "enum", options: ["test", "lint", "review", "build"] },
    { key: "applies_to", kind: "links", linkType: "tech" },
    { key: "command", kind: "text" },
    { key: "since", kind: "text" },
    { key: "until", kind: "text" },
  ],
  profile: [...common, { key: "description", kind: "textarea" }, { key: "use_when", kind: "list" }, { key: "stack", kind: "stack" }],
  project: [
    ...common,
    { key: "description", kind: "textarea" },
    { key: "path", kind: "text" },
    { key: "status", kind: "enum", options: ["active", "paused", "archived"] },
    { key: "profile", kind: "link", linkType: "profile" },
    { key: "stack", kind: "stack" },
    { key: "reason", kind: "textarea" },
    { key: "lessons", kind: "list" },
  ],
};

type TechKind = Extract<NoteData, { type: "tech" }>["kind"];
type CheckKind = Extract<NoteData, { type: "check" }>["kind"];

export type TemplateOptions = {
  title?: string;
  layer?: string | string[];
  /** Tech or check kind, depending on the template. */
  kind?: string;
  description?: string;
  version?: string;
  language?: string;
  use_when?: string[];
  avoid_when?: string[];
  applies_to?: string[];
  since?: string;
  until?: string;
  command?: string;
  path?: string;
  status?: "active" | "paused" | "archived";
  profile?: string;
  stack?: Record<string, string[]>;
  reason?: string;
};

/** Only write a string field when it carries real content; never persist "". */
function text(key: string, value: string | undefined): Record<string, string> {
  const trimmed = value?.trim();
  return trimmed ? { [key]: trimmed } : {};
}

export const TEMPLATES: Record<NoteType, (opts?: TemplateOptions) => NoteData> = {
  layer: (opts = {}) => ({
    type: "layer",
    tags: [],
    source: "manual",
    ...text("title", opts.title),
    ...text("description", opts.description),
  }),
  tech: (opts = {}) => ({
    type: "tech",
    kind: (opts.kind as TechKind) ?? "framework",
    layer: opts.layer ?? "backend",
    tags: [],
    source: "manual",
    use_when: opts.use_when ?? [],
    avoid_when: opts.avoid_when ?? [],
    performs_best: [],
    related: [],
    practices: [],
    checks: [],
    ...text("title", opts.title),
    ...text("version", opts.version),
    ...text("language", opts.language),
  }),
  practice: (opts = {}) => ({
    type: "practice",
    applies_to: opts.applies_to ?? [],
    tags: [],
    source: "manual",
    ...text("title", opts.title),
    ...text("since", opts.since),
    ...text("until", opts.until),
  }),
  check: (opts = {}) => ({
    type: "check",
    kind: (opts.kind as CheckKind) ?? "test",
    applies_to: opts.applies_to ?? [],
    tags: [],
    source: "manual",
    ...text("title", opts.title),
    ...text("command", opts.command),
    ...text("since", opts.since),
    ...text("until", opts.until),
  }),
  profile: (opts = {}) => ({
    type: "profile",
    use_when: opts.use_when ?? [],
    stack: opts.stack ?? {},
    tags: [],
    source: "manual",
    ...text("title", opts.title),
    ...text("description", opts.description),
  }),
  project: (opts = {}) => ({
    type: "project",
    status: opts.status ?? "active",
    stack: opts.stack ?? {},
    lessons: [],
    tags: [],
    source: "manual",
    ...text("title", opts.title),
    ...text("description", opts.description),
    ...text("path", opts.path),
    ...text("profile", opts.profile),
    ...text("reason", opts.reason),
  }),
};
