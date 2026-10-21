import fs from "node:fs";
import { createRequire } from "node:module";
import {
  appendActivity,
  detectStack,
  NOTE_TYPES,
  noteSchema,
  recordOutcome,
  renderContext,
  renderExport,
  search,
  stackTemplates,
  title,
  UnknownTechError,
  Vault,
  VaultNotFoundError,
} from "@marcozvd/basics-core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getRecommender } from "../recommender.js";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });
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

export function createMcpServer(resolveRoot: () => string, opts: McpServerOptions = {}): McpServer {
  const server = new McpServer({ name: "basics", version });
  // Reload on every call so manual edits in the vault show up immediately.
  const vault = () => Vault.load(resolveRoot());
  const log = (tool: string, noteIds: string[], detail?: string) => {
    try {
      appendActivity(resolveRoot(), {
        agent: server.server.getClientVersion()?.name ?? opts.clientHint ?? "unknown",
        tool,
        noteIds,
        detail,
      });
    } catch {
      // Activity logging must never break a tool call.
    }
  };

  server.registerTool(
    "list_layers",
    {
      description: "List the stack layers (backend, frontend, testing, ...) and the technologies stored under each.",
      inputSchema: {},
    },
    async () =>
      withVault(() => {
        const v = vault();
        const layers = v.byType("layer").map((l) => ({
          id: l.id,
          title: title(l),
          techs: v.techInLayer(l.id).map((t) => t.id),
        }));
        log("list_layers", []);
        return json(layers);
      }),
  );

  server.registerTool(
    "search_vault",
    {
      description: "Full-text search over the user's stack vault. Use before proposing new notes to avoid duplicates.",
      inputSchema: {
        query: z.string(),
        type: z.enum(NOTE_TYPES).optional(),
        layer: z.string().optional().describe("Restrict to tech notes in this layer"),
        limit: z.number().int().positive().max(50).optional(),
      },
    },
    async ({ query, type, layer, limit }) =>
      withVault(() => {
        const hits = search(vault(), query, { type, layer, limit });
        log(
          "search_vault",
          hits.slice(0, 10).map((h) => h.id),
          query,
        );
        return json(hits);
      }),
  );

  server.registerTool(
    "get_note",
    {
      description: "Read a vault note (frontmatter + markdown body) plus which notes link to it.",
      inputSchema: { id: z.string() },
    },
    async ({ id }) =>
      withVault(() => {
        const v = vault();
        const n = v.get(id);
        if (!n) return fail(`note "${id}" not found`);
        log("get_note", [id]);
        return json({ id: n.id, data: n.data, body: n.body, links: n.links, backlinks: v.getBacklinks(n.id), hash: n.hash });
      }),
  );

  server.registerTool(
    "recommend_stack",
    {
      description:
        "Given a natural-language project description, return ranked technology candidates per layer and matching stack profiles from the user's vault. " +
        "Treat as a shortlist: read the candidate notes, choose, and explain the choice to the user. Prefer the user's vault over general knowledge.",
      inputSchema: {
        description: z.string(),
        layers: z.array(z.string()).optional(),
        per_layer: z.number().int().positive().max(10).optional(),
      },
    },
    async ({ description, layers, per_layer }) =>
      withVault(async () => {
        const v = vault();
        const run = await getRecommender(v);
        const rec = await run(description, { layers, perLayer: per_layer });
        log(
          "recommend_stack",
          Object.values(rec.layers).flatMap((candidates) => (candidates[0] ? [candidates[0].id] : [])),
          description,
        );
        return json(rec);
      }),
  );

  server.registerTool(
    "get_stack_context",
    {
      description:
        "Compile best practices and validation checks for a chosen set of technologies into one markdown document. " +
        "Call once the stack is chosen and follow it while writing code; run the listed checks before declaring work done.",
      inputSchema: { tech_ids: z.array(z.string()).min(1), versions: z.record(z.string(), z.string()).optional() },
    },
    async ({ tech_ids, versions }) =>
      withVault(() => {
        const markdown = renderContext(vault(), tech_ids, { versions });
        log("get_stack_context", tech_ids);
        return text(markdown);
      }),
  );

  server.registerTool(
    "get_check_templates",
    {
      description:
        "Return the file templates (tests, configs) shipped by the checks of a chosen stack. " +
        "Write missing files into the project; never overwrite existing files.",
      inputSchema: { stack: z.array(z.string()).min(1), versions: z.record(z.string(), z.string()).optional() },
    },
    async ({ stack, versions }) =>
      withVault(() => {
        const templates = stackTemplates(vault(), stack, { versions });
        log("get_check_templates", stack);
        return text(`${JSON.stringify(templates, null, 2)}\n\n${TEMPLATES_NOTE}`);
      }),
  );

  server.registerTool(
    "detect_stack",
    {
      description:
        "Detect technologies and versions from a project directory's package.json, pyproject.toml and requirements files. Read-only.",
      inputSchema: { path: z.string().describe("Existing project directory") },
    },
    async ({ path: dir }) =>
      withVault(() => {
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return fail(`not a directory: ${dir}`);
        const result = detectStack(vault(), dir);
        log(
          "detect_stack",
          result.techs.map((tech) => tech.id),
          dir,
        );
        return json(result);
      }),
  );

  server.registerTool(
    "propose_note",
    {
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
    },
    async ({ id, type, frontmatter, body, reason, agent }) => {
      if (agent.startsWith("pack:")) return fail("agent names starting with 'pack:' are reserved");
      const parsed = noteSchema.safeParse({ ...frontmatter, type });
      if (!parsed.success) return fail(`invalid frontmatter: ${parsed.error.message}`);
      return withVault(() => {
        const p = vault().propose(id, parsed.data, body, { proposed_by: agent, reason });
        log("propose_note", [id], reason);
        return json({ status: "pending_review", id: p.id, action: p.meta.action, path: p.path });
      });
    },
  );

  server.registerTool(
    "record_project_outcome",
    {
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
    },
    async (input) => {
      const agent = server.server.getClientVersion()?.name ?? opts.clientHint ?? "unknown";
      if (agent.startsWith("pack:")) return fail("agent names starting with 'pack:' are reserved");
      return withVault(() => {
        try {
          const ids = recordOutcome(vault(), input, agent);
          log("record_project_outcome", ids);
          return json({ status: "pending_review", proposals: ids });
        } catch (err) {
          if (err instanceof Error) return fail(err.message);
          throw err;
        }
      });
    },
  );

  server.registerTool(
    "export_project",
    {
      description:
        "Render the files that make a project's coding agents follow the user's stack: STACK.md always, plus AGENTS.md, CLAUDE.md and/or Cursor rules. " +
        "Pass the current file contents in `existing` so agent-file blocks merge instead of overwriting user text; basics never writes outside the vault.",
      inputSchema: {
        stack: z.array(z.string()).min(1),
        targets: z.array(z.enum(["agents", "claude", "cursor"])).optional(),
        existing: z.record(z.string(), z.string()).optional().describe("Current file contents keyed by relative path"),
      },
    },
    async ({ stack, targets, existing }) =>
      withVault(() => {
        try {
          const files = renderExport(vault(), stack, targets ?? ["agents", "claude"], (relPath) => existing?.[relPath] ?? null);
          log("export_project", stack);
          return text(
            `${JSON.stringify(files, null, 2)}\n\nWrite these files into the project root; basics never writes outside the vault.`,
          );
        } catch (err) {
          if (err instanceof UnknownTechError) return fail(err.message);
          throw err;
        }
      }),
  );

  server.registerTool(
    "list_proposals",
    {
      description: "List agent proposals waiting for user review in the vault inbox.",
      inputSchema: {},
    },
    async () =>
      withVault(() => {
        const proposals = vault()
          .listProposals()
          .map(({ id, meta, data }) => ({ id, type: data.type, ...meta }));
        log("list_proposals", []);
        return json(proposals);
      }),
  );

  return server;
}
