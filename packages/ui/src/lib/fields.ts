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

export type TemplateOptions = {
  title?: string;
  layer?: string | string[];
};

export const TEMPLATES: Record<NoteType, (opts?: TemplateOptions) => NoteData> = {
  layer: (opts = {}) => ({
    type: "layer",
    tags: [],
    source: "manual",
    ...(opts.title ? { title: opts.title } : {}),
  }),
  tech: (opts = {}) => ({
    type: "tech",
    kind: "framework",
    layer: opts.layer ?? "backend",
    tags: [],
    source: "manual",
    use_when: [],
    avoid_when: [],
    performs_best: [],
    related: [],
    practices: [],
    checks: [],
    ...(opts.title ? { title: opts.title } : {}),
  }),
  practice: (opts = {}) => ({
    type: "practice",
    applies_to: [],
    tags: [],
    source: "manual",
    ...(opts.title ? { title: opts.title } : {}),
  }),
  check: (opts = {}) => ({
    type: "check",
    kind: "test",
    applies_to: [],
    tags: [],
    source: "manual",
    ...(opts.title ? { title: opts.title } : {}),
  }),
  profile: (opts = {}) => ({
    type: "profile",
    use_when: [],
    stack: {},
    tags: [],
    source: "manual",
    ...(opts.title ? { title: opts.title } : {}),
  }),
  project: (opts = {}) => ({
    type: "project",
    status: "active",
    stack: {},
    lessons: [],
    tags: [],
    source: "manual",
    ...(opts.title ? { title: opts.title } : {}),
  }),
};
