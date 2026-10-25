import fs from "node:fs";
import { createRequire } from "node:module";
import {
  appendActivity,
  detectStack,
  NOTE_TYPES,
  type NoteData,
  noteSchema,
  recordOutcome,
  renderContext,
  renderExport,
  search,
  stackTemplates,
  title,
  toId,
  UnknownTechError,
  Vault,
  VaultNotFoundError,
} from "@marcozvd/basics-core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getRecommender } from "../recommender.js";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
}

const json = (value: unknown): ToolResult => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const text = (value: string): ToolResult => ({ content: [{ type: "text" as const, text: value }] });
const fail = (message: string): ToolResult => ({ content: [{ type: "text" as const, text: message }], isError: true });
const TEMPLATES_NOTE = "Write missing files into the project; never overwrite existing files.";

// Report a missing vault as a tool error instead of crashing the whole server.
const withVault = async <T>(fn: () => T | Promise<T>) => {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof VaultNotFoundError) return fail(err.message);
    throw err;
  }
};

export interface McpServerOptions {
  clientHint?: string;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface ToolContext {
  vault: () => Vault;
  log: (tool: string, noteIds: string[], detail?: string) => void;
  clientName: () => string | undefined;
}

interface ToolSpec {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult> | ToolResult;
}

/** Keep each tool's input typed while the shared list can hold them all. */
function defineTool<S extends z.ZodRawShape>(spec: {
  name: string;
  description: string;
  inputSchema: S;
  run: (input: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<ToolResult> | ToolResult;
}): ToolSpec {
  return spec as unknown as ToolSpec;
}

// The overview is a whole-vault catalog, so it is bounded instead of trimmed by ranking.
const OVERVIEW_LIMIT = 60 * 1024;
const OVERVIEW_LIST_CAP = 3;

interface OverviewTech {
  id: string;
  title: string;
  kind: string;
  use_when?: string[];
  avoid_when?: string[];
  performs_best?: string[];
  version?: string;
  language?: string;
}

interface OverviewLayer {
  id: string;
  title: string;
  techs: OverviewTech[];
  omitted?: string[];
}

interface OverviewProfile {
  id: string;
  title: string;
  use_when?: string[];
  stack?: Record<string, string[]>;
}

interface OverviewProject {
  id: string;
  title: string;
  status: string;
  stack?: Record<string, string[]>;
  lessons?: string[];
}

interface VaultOverview {
  layers: OverviewLayer[];
  profiles: OverviewProfile[];
  projects: OverviewProject[];
  truncated?: boolean;
}

/** Drop fields the agent cannot use: undefined, empty strings, empty lists and empty maps. */
function withoutEmpty<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => {
      if (item === undefined || item === "") return false;
      if (Array.isArray(item)) return item.length > 0;
      if (typeof item === "object" && item !== null) return Object.keys(item).length > 0;
      return true;
    }),
  ) as Partial<T>;
}

function capList(list: string[] | undefined): string[] | undefined {
  return list && list.length > OVERVIEW_LIST_CAP ? list.slice(0, OVERVIEW_LIST_CAP) : list;
}

function capStack(stack: Record<string, string[]> | undefined): void {
  if (!stack) return;
  for (const [layer, techs] of Object.entries(stack)) {
    const capped = capList(techs);
    if (capped) stack[layer] = capped;
  }
}

function buildOverview(vault: Vault, layers?: string[]): VaultOverview {
  const only = layers?.length ? new Set(layers.map(toId)) : undefined;

  return {
    layers: vault
      .byType("layer")
      .filter((layer) => !only || only.has(toId(layer.id)))
      .map((layer) => ({
        id: layer.id,
        title: title(layer),
        techs: vault
          .techInLayer(layer.id)
          .map((note) => {
            const d = note.data as Extract<NoteData, { type: "tech" }>;
            return {
              id: note.id,
              title: title(note),
              kind: d.kind,
              ...withoutEmpty({
                use_when: d.use_when,
                avoid_when: d.avoid_when,
                performs_best: d.performs_best,
                version: d.version,
                language: d.language,
              }),
            } as OverviewTech;
          })
          .sort((a, b) => a.id.localeCompare(b.id)),
      })),
    profiles: vault.byType("profile").map((note) => {
      const d = note.data as Extract<NoteData, { type: "profile" }>;
      return {
        id: note.id,
        title: title(note),
        ...withoutEmpty({ use_when: d.use_when, stack: d.stack }),
      } as OverviewProfile;
    }),
    projects: vault
      .byType("project")
      .map((note) => ({ note, d: note.data as Extract<NoteData, { type: "project" }> }))
      .filter(({ d }) => d.status !== "archived")
      .map(({ note, d }) => ({
        id: note.id,
        title: title(note),
        status: d.status,
        ...withoutEmpty({ stack: d.stack, lessons: d.lessons.slice(-3) }),
      })) as OverviewProject[],
  };
}

/** Serialize the catalog, degrading it step by step until it fits the size budget. */
function renderOverview(overview: VaultOverview): string {
  const render = () => JSON.stringify(overview);
  let body = render();
  if (body.length <= OVERVIEW_LIMIT) return body;

  overview.truncated = true;
  for (const layer of overview.layers) for (const tech of layer.techs) delete tech.performs_best;
  body = render();
  if (body.length <= OVERVIEW_LIMIT) return body;

  for (const layer of overview.layers) {
    for (const tech of layer.techs) {
      tech.use_when = capList(tech.use_when);
      tech.avoid_when = capList(tech.avoid_when);
    }
  }
  for (const profile of overview.profiles) {
    profile.use_when = capList(profile.use_when);
    capStack(profile.stack);
  }
  for (const project of overview.projects) {
    project.lessons = capList(project.lessons);
    capStack(project.stack);
  }
  body = render();
  if (body.length <= OVERVIEW_LIMIT) return body;

  // Keep one reason per tech, then drop whole techs from the largest layers if still over.
  for (const layer of overview.layers) {
    for (const tech of layer.techs) {
      if (tech.use_when) tech.use_when = tech.use_when.slice(0, 1);
      if (tech.avoid_when) tech.avoid_when = tech.avoid_when.slice(0, 1);
    }
  }
  body = render();
  while (body.length > OVERVIEW_LIMIT) {
    const total = overview.layers.reduce((count, layer) => count + layer.techs.length, 0);
    if (!total) break;
    // Estimate how many techs must go, then drop them from the largest layers before rendering again.
    const perTech = Math.max(1, Math.floor(body.length / total));
    let remaining = Math.max(1, Math.ceil((body.length - OVERVIEW_LIMIT) / perTech));
    while (remaining > 0) {
      const layer = overview.layers.reduce<OverviewLayer | undefined>(
        (largest, current) => (current.techs.length > (largest?.techs.length ?? 0) ? current : largest),
        undefined,
      );
      const dropped = layer?.techs.pop();
      if (!layer || !dropped) break;
      layer.omitted ??= [];
      layer.omitted.push(dropped.id);
      remaining -= 1;
    }
    body = render();
  }
  for (const layer of overview.layers) layer.omitted?.sort();
  return render();
}

const TOOLS: ToolSpec[] = [
  defineTool({
    name: "get_vault_overview",
    description:
      "Read the whole vault catalog in one call: every layer with its techs (kind, use_when, avoid_when, performs_best), the stack profiles and the past projects. " +
      "Use it to reason over the vault when a ranked shortlist is not enough; read deciding notes with get_note before choosing. Read-only.",
    inputSchema: {
      layers: z.array(z.string()).optional().describe("Restrict the catalog to these layer ids"),
    },
    run: async ({ layers }, ctx) =>
      withVault(() => {
        const overview = buildOverview(ctx.vault(), layers);
        ctx.log("get_vault_overview", []);
        return text(renderOverview(overview));
      }),
  }),
  defineTool({
    name: "list_layers",
    description: "List the stack layers (backend, frontend, testing, ...) and the technologies stored under each.",
    inputSchema: {},
    run: async (_input, ctx) =>
      withVault(() => {
        const v = ctx.vault();
        const layers = v.byType("layer").map((l) => ({
          id: l.id,
          title: title(l),
          techs: v.techInLayer(l.id).map((t) => t.id),
        }));
        ctx.log("list_layers", []);
        return json(layers);
      }),
  }),
  defineTool({
    name: "search_vault",
    description: "Full-text search over the user's stack vault. Use before proposing new notes to avoid duplicates.",
    inputSchema: {
      query: z.string(),
      type: z.enum(NOTE_TYPES).optional(),
      layer: z.string().optional().describe("Restrict to tech notes in this layer"),
      limit: z.number().int().positive().max(50).optional(),
    },
    run: async ({ query, type, layer, limit }, ctx) =>
      withVault(() => {
        const hits = search(ctx.vault(), query, { type, layer, limit });
        ctx.log(
          "search_vault",
          hits.slice(0, 10).map((h) => h.id),
          query,
        );
        return json(hits);
      }),
  }),
  defineTool({
    name: "get_note",
    description: "Read a vault note (frontmatter + markdown body) plus which notes link to it.",
    inputSchema: { id: z.string() },
    run: async ({ id }, ctx) =>
      withVault(() => {
        const v = ctx.vault();
        const n = v.get(id);
        if (!n) return fail(`note "${id}" not found`);
        ctx.log("get_note", [id]);
        return json({ id: n.id, data: n.data, body: n.body, links: n.links, backlinks: v.getBacklinks(n.id), hash: n.hash });
      }),
  }),
  defineTool({
    name: "recommend_stack",
    description:
      "Given a natural-language project description, return ranked technology candidates per layer and matching stack profiles from the user's vault. " +
      "Treat as a shortlist: read the candidate notes, choose, and explain the choice to the user. Prefer the user's vault over general knowledge.",
    inputSchema: {
      description: z.string(),
      layers: z.array(z.string()).optional(),
      per_layer: z.number().int().positive().max(10).optional(),
    },
    run: async ({ description, layers, per_layer }, ctx) =>
      withVault(async () => {
        const v = ctx.vault();
        const run = await getRecommender(v);
        const rec = await run(description, { layers, perLayer: per_layer });
        ctx.log(
          "recommend_stack",
          Object.values(rec.layers).flatMap((candidates) => (candidates[0] ? [candidates[0].id] : [])),
          description,
        );
        // A layer with no matching candidate is omitted rather than returned as an empty list.
        const ranked = Object.fromEntries(Object.entries(rec.layers).filter(([, candidates]) => candidates.length > 0));
        return json({ ...rec, layers: ranked });
      }),
  }),
  defineTool({
    name: "get_stack_context",
    description:
      "Compile best practices and validation checks for a chosen set of technologies into one markdown document. " +
      "Call once the stack is chosen and follow it while writing code; run the listed checks before declaring work done.",
    inputSchema: { tech_ids: z.array(z.string()).min(1), versions: z.record(z.string(), z.string()).optional() },
    run: async ({ tech_ids, versions }, ctx) =>
      withVault(() => {
        const markdown = renderContext(ctx.vault(), tech_ids, { versions });
        ctx.log("get_stack_context", tech_ids);
        return text(markdown);
      }),
  }),
  defineTool({
    name: "get_check_templates",
    description:
      "Return the file templates (tests, configs) shipped by the checks of a chosen stack. " +
      "Write missing files into the project; never overwrite existing files.",
    inputSchema: { stack: z.array(z.string()).min(1), versions: z.record(z.string(), z.string()).optional() },
    run: async ({ stack, versions }, ctx) =>
      withVault(() => {
        const templates = stackTemplates(ctx.vault(), stack, { versions });
        ctx.log("get_check_templates", stack);
        return text(`${JSON.stringify(templates, null, 2)}\n\n${TEMPLATES_NOTE}`);
      }),
  }),
  defineTool({
    name: "detect_stack",
    description:
      "Detect technologies and versions from a project directory's package.json, pyproject.toml and requirements files. Read-only.",
    inputSchema: { path: z.string().describe("Existing project directory") },
    run: async ({ path: dir }, ctx) =>
      withVault(() => {
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return fail(`not a directory: ${dir}`);
        const result = detectStack(ctx.vault(), dir);
        ctx.log(
          "detect_stack",
          result.techs.map((tech) => tech.id),
          dir,
        );
        return json(result);
      }),
  }),
  defineTool({
    name: "propose_note",
    description:
      "Propose a new note or an update to an existing one. It lands in the vault inbox for the user to approve; it is NOT applied directly. " +
      "Frontmatter must match the note type schema (e.g. tech: kind, layer, use_when, avoid_when, performs_best, practices, checks). " +
      "Use [[id]] wikilinks in the body to connect notes.",
    inputSchema: {
      id: z.string().describe("Slug, e.g. 'fastapi' or 'react-server-components'"),
      type: z.enum(NOTE_TYPES),
      frontmatter: z.record(z.string(), z.unknown()).describe("Fields for the note type, excluding 'type'"),
      body: z.string().describe("Markdown body"),
      reason: z.string().describe("Why this note should be added/changed"),
      agent: z.string().describe("Name of the proposing agent, e.g. 'claude-code'"),
    },
    run: async ({ id, type, frontmatter, body, reason, agent }, ctx) => {
      if (agent.startsWith("pack:")) return fail("agent names starting with 'pack:' are reserved");
      const parsed = noteSchema.safeParse({ ...frontmatter, type });
      if (!parsed.success) return fail(`invalid frontmatter: ${parsed.error.message}`);
      return withVault(() => {
        const p = ctx.vault().propose(id, parsed.data, body, { proposed_by: agent, reason });
        ctx.log("propose_note", [id], reason);
        return json({ status: "pending_review", id: p.id, action: p.meta.action, path: p.path });
      });
    },
  }),
  defineTool({
    name: "record_project_outcome",
    description:
      "Propose an outcome for a project note: append lessons, optionally extend tech notes (use_when, avoid_when, performs_best, lessons) and add a dated outcome section. " +
      "Everything lands in the vault inbox for review; nothing is applied directly.",
    inputSchema: {
      project: z.string().describe("Project note id"),
      summary: z.string().describe("What happened and what was learned"),
      lessons: z.array(z.string()).optional(),
      tech_updates: z
        .array(
          z.object({
            id: z.string(),
            add_use_when: z.array(z.string()).optional(),
            add_avoid_when: z.array(z.string()).optional(),
            add_performs_best: z.array(z.string()).optional(),
            lesson: z.string().optional(),
          }),
        )
        .optional(),
    },
    run: async (input, ctx) => {
      const agent = ctx.clientName() ?? "unknown";
      if (agent.startsWith("pack:")) return fail("agent names starting with 'pack:' are reserved");
      return withVault(() => {
        try {
          const ids = recordOutcome(ctx.vault(), input, agent);
          ctx.log("record_project_outcome", ids);
          return json({ status: "pending_review", proposals: ids });
        } catch (err) {
          if (err instanceof Error) return fail(err.message);
          throw err;
        }
      });
    },
  }),
  defineTool({
    name: "export_project",
    description:
      "Render the files that make a project's coding agents follow the user's stack: STACK.md always, plus AGENTS.md, CLAUDE.md and/or Cursor rules. " +
      "Pass the current file contents in `existing` so agent-file blocks merge instead of overwriting user text; basics never writes outside the vault.",
    inputSchema: {
      stack: z.array(z.string()).min(1),
      targets: z.array(z.enum(["agents", "claude", "cursor"])).optional(),
      existing: z.record(z.string(), z.string()).optional().describe("Current file contents keyed by relative path"),
    },
    run: async ({ stack, targets, existing }, ctx) =>
      withVault(() => {
        try {
          const files = renderExport(ctx.vault(), stack, targets ?? ["agents", "claude"], (relPath) => existing?.[relPath] ?? null);
          ctx.log("export_project", stack);
          return text(
            `${JSON.stringify(files, null, 2)}\n\nWrite these files into the project root; basics never writes outside the vault.`,
          );
        } catch (err) {
          if (err instanceof UnknownTechError) return fail(err.message);
          throw err;
        }
      }),
  }),
  defineTool({
    name: "list_proposals",
    description: "List agent proposals waiting for user review in the vault inbox.",
    inputSchema: {},
    run: async (_input, ctx) =>
      withVault(() => {
        const proposals = ctx
          .vault()
          .listProposals()
          .map(({ id, meta, data }) => ({ id, type: data.type, ...meta }));
        ctx.log("list_proposals", []);
        return json(proposals);
      }),
  }),
];

const PLAN_STACK_PROMPT = `Plan the stack for this project:

<project>

Work from the user's vault, not from general knowledge:

1. Call \`get_vault_overview\` to see every layer with its techs (\`use_when\`, \`avoid_when\`, \`performs_best\`), the stack profiles and the past projects. Pass \`layers\` only when the user already named the layers.
2. Call \`recommend_stack\` with the project description above as a cross-check. Treat the ranking as a shortlist, not the decision.
3. Read the deciding notes with \`get_note\` before committing to a tech, especially when two candidates are close or a profile looks like a match.
4. Answer with a short **stack decision**: one tech per needed layer, each with one line of reason citing the vault note (\`[[id]]\`) and the \`use_when\` it matched. Add anything in \`avoid_when\` that ruled out an alternative. Prefer a matching profile when one fits, and prefer what past projects used successfully while respecting their lessons.
5. Fill the gaps the decision exposes: if a technology the decision needs has no note in the vault, or a chosen note links to a missing \`[[id]]\`, check with \`search_vault\` and \`get_note\`, then \`propose_note\` the missing note before or right after giving the decision. Never propose more than the notes the decision actually uses.
   - Each proposed note must be useful on its own: correct \`type\`, and for a tech the right \`kind\` and \`layer\` (an existing layer id) plus \`language\` when it applies; at least 2 \`use_when\`, at least 1 \`avoid_when\`, \`tags\` and \`related\`. Link \`[[id]]\` in the body and \`related\` only to notes that exist or that you propose in the same answer.
   - Body of 3–6 lines, specific: what it is, when it beats the alternatives already in the vault, and one concrete pitfall or setup note. \`reason\` says which project decision needed it.
6. List the proposals in the answer ("Propuestas al Inbox: rustls, reqwest") and repeat that nothing is applied until the user approves it in the Inbox.
7. Ask ONE question before writing any file: "¿Usamos este stack? / Shall we use this stack?" in the user's language.
8. After a yes, follow the skill's New project steps: \`get_stack_context\` for the chosen techs, \`get_check_templates\` for the files to create, then \`export_project\` (send existing agent file contents in \`existing\`) and write the returned files into the project root.`;

interface PromptSpec {
  name: string;
  description: string;
  argsSchema: z.ZodRawShape;
  render: (args: Record<string, string>) => string;
}

const PROMPTS: PromptSpec[] = [
  {
    name: "plan-stack",
    description:
      "Plan a project's stack from the vault: read the whole catalog and the ranked shortlist, decide one tech per layer, explain the choice, propose any note the vault is missing for that decision and ask for confirmation before writing files.",
    argsSchema: {
      project: z.string().describe("What the user is building: product, users and any constraint already known."),
    },
    render: (args) => PLAN_STACK_PROMPT.replace("<project>", () => args.project),
  },
];

export interface McpPromptDefinition {
  name: string;
  description: string;
  arguments: { name: string; description: string; required: boolean }[];
}

/** Prompt names, descriptions and arguments, shared with the reference generator. */
export function promptDefinitions(): McpPromptDefinition[] {
  return PROMPTS.map((prompt) => {
    const schema = z.toJSONSchema(z.object(prompt.argsSchema)) as {
      properties?: Record<string, { description?: string }>;
      required?: string[];
    };
    const required = new Set(schema.required ?? []);
    return {
      name: prompt.name,
      description: prompt.description,
      arguments: Object.entries(schema.properties ?? {}).map(([name, prop]) => ({
        name,
        description: prop.description ?? "",
        required: required.has(name),
      })),
    };
  });
}

/** Tool names, descriptions and JSON input schemas, shared with the reference generator. */
export function toolDefinitions(): McpToolDefinition[] {
  return TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: z.toJSONSchema(z.object(tool.inputSchema)) as Record<string, unknown>,
  }));
}

export function createMcpServer(resolveRoot: () => string, opts: McpServerOptions = {}): McpServer {
  const server = new McpServer({ name: "basics", version });
  // Reload on every call so manual edits in the vault show up immediately.
  const vault = () => Vault.load(resolveRoot());
  const clientName = () => server.server.getClientVersion()?.name ?? opts.clientHint;
  const log = (tool: string, noteIds: string[], detail?: string) => {
    try {
      appendActivity(resolveRoot(), {
        agent: clientName() ?? "unknown",
        tool,
        noteIds,
        detail,
      });
    } catch {
      // Activity logging must never break a tool call.
    }
  };
  const context: ToolContext = { vault, log, clientName };

  for (const tool of TOOLS) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, (input) =>
      tool.run(input as Record<string, unknown>, context),
    );
  }

  for (const prompt of PROMPTS) {
    server.registerPrompt(prompt.name, { description: prompt.description, argsSchema: prompt.argsSchema }, (args) => ({
      messages: [
        {
          role: "user",
          content: { type: "text", text: prompt.render(args as Record<string, string>) },
        },
      ],
    }));
  }

  return server;
}
