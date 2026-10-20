#!/usr/bin/env node
import {
  NOTE_TYPES,
  noteSchema,
  recommend,
  renderContext,
  resolveVaultDir,
  search,
  title,
  Vault,
  VaultNotFoundError,
} from "@marcozvd/basics-core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const root = resolveVaultDir(process.argv[2]);
// Reload on every call so manual edits in the vault show up immediately.
const vault = () => Vault.load(root);

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });
const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });
const fail = (message: string) => ({ content: [{ type: "text" as const, text: message }], isError: true });

// Report a missing vault as a tool error instead of crashing the whole server.
const withVault = <T>(fn: () => T) => {
  try {
    return fn();
  } catch (err) {
    if (err instanceof VaultNotFoundError) return fail(err.message);
    throw err;
  }
};

const server = new McpServer({ name: "basics", version: "0.0.1" });

server.registerTool(
  "list_layers",
  {
    description: "List the stack layers (backend, frontend, testing, ...) and the technologies stored under each.",
    inputSchema: {},
  },
  async () =>
    withVault(() => {
      const v = vault();
      return json(
        v.byType("layer").map((l) => ({
          id: l.id,
          title: title(l),
          techs: v.techInLayer(l.id).map((t) => t.id),
        })),
      );
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
  async ({ query, type, layer, limit }) => withVault(() => json(search(vault(), query, { type, layer, limit }))),
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
  async ({ description, layers, per_layer }) => withVault(() => json(recommend(vault(), description, { layers, perLayer: per_layer }))),
);

server.registerTool(
  "get_stack_context",
  {
    description:
      "Compile best practices and validation checks for a chosen set of technologies into one markdown document. " +
      "Call once the stack is chosen and follow it while writing code; run the listed checks before declaring work done.",
    inputSchema: { tech_ids: z.array(z.string()).min(1) },
  },
  async ({ tech_ids }) => withVault(() => text(renderContext(vault(), tech_ids))),
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
    const parsed = noteSchema.safeParse({ ...frontmatter, type });
    if (!parsed.success) return fail(`invalid frontmatter: ${parsed.error.message}`);
    return withVault(() => {
      const p = vault().propose(id, parsed.data, body, { proposed_by: agent, reason });
      return json({ status: "pending_review", id: p.id, action: p.meta.action, path: p.path });
    });
  },
);

server.registerTool(
  "list_proposals",
  {
    description: "List agent proposals waiting for user review in the vault inbox.",
    inputSchema: {},
  },
  async () =>
    withVault(() =>
      json(
        vault()
          .listProposals()
          .map(({ id, meta, data }) => ({ id, type: data.type, ...meta })),
      ),
    ),
);

await server.connect(new StdioServerTransport());
