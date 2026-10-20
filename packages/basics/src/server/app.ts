import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  type ApiError,
  type ApproveRequest,
  ConflictError,
  type ContextResponse,
  type CreateNoteRequest,
  configSchema,
  type LayerSummary,
  listNotes,
  loadConfig,
  type NoteType,
  NotFoundError,
  proposalDetail,
  type RecommendRequest,
  readActivity,
  recommend,
  renderContext,
  type SaveNoteRequest,
  saveConfig,
  search,
  title,
  toDetail,
  Vault,
  VaultNotFoundError,
  vaultStats,
} from "@marcozvd/basics-core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { ZodError, z } from "zod";
import { createMcpServer } from "../mcp/tools.js";
import type { EventHub } from "./events.js";

const { version } = createRequire(import.meta.url)("../../package.json") as { version: string };

const ALLOWED_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MCP_SESSION_IDLE_MS = 30 * 60 * 1000;
const MCP_MAX_SESSIONS = 50;

interface McpSession {
  transport: WebStandardStreamableHTTPServerTransport;
  server: McpServer;
  lastSeen: number;
}

const contextRequestSchema = z.object({ techIds: z.array(z.string()).min(1) });

/** A sessionless POST only creates a session when it carries the initialize request. */
async function isInitializeRequest(req: Request): Promise<boolean> {
  try {
    const body = (await req.clone().json()) as unknown;
    return typeof body === "object" && body !== null && !Array.isArray(body) && (body as { method?: unknown }).method === "initialize";
  } catch {
    return false;
  }
}

function hostnameOf(value: string): string | undefined {
  try {
    return new URL(`http://${value}`).hostname;
  } catch {
    return undefined;
  }
}

function originHostname(value: string): string | undefined {
  try {
    return new URL(value).hostname;
  } catch {
    return undefined;
  }
}

export function createApp(opts: { root: string; uiDir?: string; events?: EventHub }): Hono {
  const app = new Hono();
  const vault = () => Vault.load(opts.root);
  const mcpSessions = new Map<string, McpSession>();

  const closeMcpSession = (id: string): void => {
    const session = mcpSessions.get(id);
    if (!session) return;
    mcpSessions.delete(id);
    void session.server.close().catch(() => {});
  };

  const oldestMcpSession = (): string | undefined => {
    let oldest: string | undefined;
    let oldestSeen = Number.POSITIVE_INFINITY;
    for (const [id, session] of mcpSessions) {
      if (session.lastSeen < oldestSeen) {
        oldest = id;
        oldestSeen = session.lastSeen;
      }
    }
    return oldest;
  };

  const makeRoomForMcpSession = (): void => {
    while (mcpSessions.size >= MCP_MAX_SESSIONS) {
      const oldest = oldestMcpSession();
      if (!oldest) break;
      closeMcpSession(oldest);
    }
  };

  app.use("*", async (c, next) => {
    const host = hostnameOf(c.req.header("host") ?? "");
    if (!host || !ALLOWED_HOSTS.has(host)) {
      return c.json({ error: "forbidden", message: "host not allowed" } satisfies ApiError, 403);
    }
    if (c.req.method !== "GET" && c.req.method !== "HEAD") {
      const origin = c.req.header("origin");
      if (origin && !ALLOWED_HOSTS.has(originHostname(origin) ?? "")) {
        return c.json({ error: "forbidden", message: "origin not allowed" } satisfies ApiError, 403);
      }
    }
    await next();
  });

  app.onError((err, c) => {
    if (err instanceof ConflictError) {
      return c.json({ error: "conflict", message: err.message, actualHash: err.actualHash } satisfies ApiError, 409);
    }
    if (err instanceof ZodError) {
      return c.json({ error: "invalid", message: err.message, issues: err.issues } satisfies ApiError, 400);
    }
    if (err instanceof NotFoundError) {
      return c.json({ error: "not_found", message: err.message } satisfies ApiError, 404);
    }
    if (err instanceof VaultNotFoundError) {
      return c.json({ error: "vault_not_found", message: err.message } satisfies ApiError, 503);
    }
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: "internal", message } satisfies ApiError, 500);
  });

  app.get("/api/health", (c) => {
    vault();
    return c.json({ ok: true, version, vault: opts.root });
  });

  app.get("/api/layers", (c) => {
    const v = vault();
    const layers: LayerSummary[] = v.byType("layer").map((layer) => ({
      id: layer.id,
      title: title(layer),
      techs: v.techInLayer(layer.id).map((tech) => tech.id),
    }));
    return c.json(layers);
  });

  app.get("/api/notes", (c) => {
    const type = c.req.query("type") as NoteType | undefined;
    const layer = c.req.query("layer");
    return c.json(listNotes(vault(), { type, layer }));
  });

  app.get("/api/notes/:id", (c) => {
    const v = vault();
    const id = c.req.param("id");
    const note = v.get(id);
    if (!note) throw new NotFoundError(id);
    return c.json(toDetail(v, note));
  });

  app.post("/api/notes", async (c) => {
    const body = await c.req.json<CreateNoteRequest>();
    const v = vault();
    if (v.get(body.id)) {
      return c.json({ error: "exists", message: `note "${body.id}" already exists` } satisfies ApiError, 409);
    }
    v.writeNote(body.id, body.data, body.body);
    const note = v.get(body.id);
    if (!note) throw new NotFoundError(body.id);
    return c.json(toDetail(v, note), 201);
  });

  app.put("/api/notes/:id", async (c) => {
    const id = c.req.param("id");
    const body = await c.req.json<SaveNoteRequest>();
    const v = vault();
    v.writeNote(id, body.data, body.body, { expectedHash: body.expectedHash });
    const note = v.get(id);
    if (!note) throw new NotFoundError(id);
    return c.json(toDetail(v, note));
  });

  app.delete("/api/notes/:id", (c) => {
    const v = vault();
    v.deleteNote(c.req.param("id"), { expectedHash: c.req.query("expectedHash") });
    return c.body(null, 204);
  });

  app.get("/api/search", (c) => {
    const type = c.req.query("type") as NoteType | undefined;
    const layer = c.req.query("layer");
    return c.json(search(vault(), c.req.query("q") ?? "", { type, layer }));
  });

  app.post("/api/recommend", async (c) => {
    const body = await c.req.json<RecommendRequest>();
    return c.json(recommend(vault(), body.description, { layers: body.layers, perLayer: body.perLayer }));
  });

  app.post("/api/context", async (c) => {
    const body = contextRequestSchema.parse(await c.req.json());
    return c.json({ markdown: renderContext(vault(), body.techIds) } satisfies ContextResponse);
  });

  app.get("/api/inbox", (c) => {
    return c.json(
      vault()
        .listProposals()
        .map((p) => ({ id: p.id, type: p.data.type, title: p.data.title ?? p.id, meta: p.meta })),
    );
  });

  app.get("/api/inbox/:id", (c) => {
    const v = vault();
    const id = c.req.param("id");
    const proposal = v.getProposal(id);
    if (!proposal) throw new NotFoundError(id);
    return c.json(proposalDetail(v, proposal));
  });

  app.post("/api/inbox/:id/approve", async (c) => {
    const id = c.req.param("id");
    const body = (await c.req.json().catch(() => ({}))) as ApproveRequest;
    const v = vault();
    v.approve(id, body);
    const note = v.get(id);
    if (!note) throw new NotFoundError(id);
    return c.json(toDetail(v, note));
  });

  app.post("/api/inbox/:id/reject", (c) => {
    vault().reject(c.req.param("id"));
    return c.body(null, 204);
  });

  app.get("/api/stats", (c) => c.json(vaultStats(vault())));

  app.get("/api/config", (c) => c.json({ language: loadConfig().language }));

  app.get("/api/activity", (c) => {
    const parsed = Number(c.req.query("limit"));
    const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 200) : undefined;
    return c.json(
      readActivity(opts.root, {
        limit,
        noteId: c.req.query("note") || undefined,
        agent: c.req.query("agent") || undefined,
      }),
    );
  });

  app.put("/api/config", async (c) => {
    const body = await c.req.json<{ language?: unknown }>();
    const config = configSchema.parse({ ...loadConfig(), language: body.language });
    saveConfig(config);
    return c.json({ language: config.language });
  });

  if (opts.events) {
    app.get("/api/events", (c) => {
      const events = opts.events;
      if (!events) return c.notFound();
      return streamSSE(c, async (stream) => {
        const unsubscribe = events.subscribe((event) => {
          void stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        });
        const ping = setInterval(() => {
          void stream.writeSSE({ event: "ping", data: "{}" });
        }, 25_000);
        await new Promise<void>((resolve) => {
          stream.onAbort(() => {
            clearInterval(ping);
            unsubscribe();
            resolve();
          });
        });
      });
    });
  }

  app.all("/mcp", async (c) => {
    const now = Date.now();
    for (const [id, session] of mcpSessions) {
      if (now - session.lastSeen > MCP_SESSION_IDLE_MS) closeMcpSession(id);
    }

    const sessionId = c.req.header("mcp-session-id");
    if (sessionId) {
      const session = mcpSessions.get(sessionId);
      if (!session) return c.json({ error: "not_found", message: "MCP session not found" } satisfies ApiError, 404);
      session.lastSeen = now;
      return session.transport.handleRequest(c.req.raw);
    }

    if (!(await isInitializeRequest(c.req.raw))) {
      return c.json({ error: "invalid", message: "missing or invalid MCP session" } satisfies ApiError, 400);
    }

    makeRoomForMcpSession();

    const server = createMcpServer(() => opts.root, { clientHint: c.req.header("user-agent") });
    const transport: WebStandardStreamableHTTPServerTransport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (id) => {
        makeRoomForMcpSession();
        mcpSessions.set(id, { transport, server, lastSeen: Date.now() });
      },
      onsessionclosed: (id) => {
        mcpSessions.delete(id);
      },
    });
    await server.connect(transport);

    const response = await transport.handleRequest(c.req.raw);
    if (!transport.sessionId || !mcpSessions.has(transport.sessionId)) await server.close().catch(() => {});
    return response;
  });

  if (opts.uiDir && fs.existsSync(opts.uiDir)) {
    const uiDir = opts.uiDir;
    app.use("/*", serveStatic({ root: uiDir }));
    app.get("*", async (c) => {
      if (c.req.path.startsWith("/api") || c.req.path.startsWith("/mcp")) return c.notFound();
      const res = await serveStatic({ root: uiDir, path: path.join("index.html") })(c, async () => {});
      return res ?? c.notFound();
    });
  }

  return app;
}
