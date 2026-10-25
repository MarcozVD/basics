import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import {
  type AgentRunStartResponse,
  type AgentsResponse,
  type ApiError,
  type ApproveAllResponse,
  type ApproveRequest,
  addCommunityPack,
  buildGraph,
  ConflictError,
  type ContextResponse,
  type CreateNoteRequest,
  configSchema,
  downloadSize,
  type Embedder,
  type EmbeddingsEnableResponse,
  type ExportRequest,
  installPack,
  type LayerSummary,
  listNotes,
  listPacks,
  loadConfig,
  loadIndex,
  type NoteType,
  NotFoundError,
  PackDownloadError,
  proposalDetail,
  type RecommendRequest,
  type RejectAllResponse,
  readActivity,
  renderContext,
  renderExport,
  type SaveNoteRequest,
  saveConfig,
  search,
  syncIndex,
  title,
  toDetail,
  UnknownTechError,
  updatePack,
  Vault,
  VaultNotFoundError,
  vaultStats,
} from "@marcozvd/basics-core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { ZodError, z } from "zod";
import { AGENT_DECISION_SUFFIX, AgentBusyError, AgentRunner, AgentUnavailableError, listAgents } from "../agents.js";
import { CONNECT_CLIENTS, connect } from "../connect.js";
import {
  createEmbedder,
  installRuntime,
  loadRuntime,
  runtimeDir,
  runtimeInstalled,
  type TransformersModule,
} from "../embeddings-runtime.js";
import { createMcpServer, planStackPrompt } from "../mcp/tools.js";
import { packsDir } from "../packs-dir.js";
import { getRecommender } from "../recommender.js";
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
const exportRequestSchema = z.object({
  stack: z.array(z.string()).min(1),
  targets: z.array(z.enum(["agents", "claude", "cursor"])).optional(),
  existing: z.record(z.string(), z.string()).optional(),
});
const packInstallRequestSchema = z.object({ lang: z.enum(["en", "es"]).optional() });
const packAddRequestSchema = z.object({
  repo: z.string().min(1),
  ref: z.string().optional(),
  path: z.string().optional(),
  lang: z.enum(["en", "es"]).optional(),
});
const approveAllRequestSchema = z
  .object({
    pack: z.string().min(1).optional(),
    version: z.string().min(1).optional(),
    agent: z.string().min(1).optional(),
    action: z.enum(["create", "update"]).optional(),
    ids: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((value) => !(value.pack && value.agent), {
    message: "pack and agent filters are mutually exclusive",
    path: ["agent"],
  })
  .refine((value) => !value.version || Boolean(value.pack), {
    message: "a version filter requires a pack",
    path: ["version"],
  });
const connectRequestSchema = z.object({
  clients: z.array(z.enum(CONNECT_CLIENTS)).optional(),
  transport: z.enum(["stdio", "http"]).optional(),
  port: z.number().int().min(1).max(65535).optional(),
  skill: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});
const agentRunRequestSchema = z.object({
  agent: z.enum(["claude", "opencode", "codex"]),
  model: z.string().min(1).optional(),
  description: z.string().min(1),
  layers: z.array(z.string().min(1)).optional(),
});

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

/** How long to wait before retrying a failed first model load (a cold hub fetch can flake). */
const EMBEDDINGS_RETRY_DELAY_MS = 500;

/**
 * Load the model, retrying once after a short delay. The first download from the desktop app
 * can fail with "Unable to get model file path or buffer." and then succeed on a second try,
 * so a transient failure is not surfaced as a permanent one.
 */
async function loadEmbedderWithRetry(runtime: TransformersModule, model: string): Promise<Embedder> {
  try {
    return await createEmbedder(runtime, model);
  } catch (first) {
    await new Promise((resolve) => setTimeout(resolve, EMBEDDINGS_RETRY_DELAY_MS));
    try {
      return await createEmbedder(runtime, model);
    } catch {
      const reason = first instanceof Error ? first.message : String(first);
      throw new Error(`Could not download the model (${reason}). Check your connection and try again.`);
    }
  }
}

export function createApp(opts: { root: string; uiDir?: string; events?: EventHub; agents?: AgentRunner }): Hono {
  const app = new Hono();
  const vault = () => Vault.load(opts.root);
  const mcpSessions = new Map<string, McpSession>();
  const agentRunner = opts.agents ?? new AgentRunner();

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
    if (err instanceof UnknownTechError) {
      return c.json({ error: "invalid", message: err.message } satisfies ApiError, 400);
    }
    if (err instanceof PackDownloadError) {
      return c.json({ error: "invalid", message: err.message, hint: err.hint } satisfies ApiError, 400);
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
    const run = await getRecommender(vault(), {
      onProgress: (done, total) => opts.events?.publish({ type: "embeddings", done, total }),
    });
    return c.json(await run(body.description, { layers: body.layers, perLayer: body.perLayer }));
  });

  app.post("/api/context", async (c) => {
    const body = contextRequestSchema.parse(await c.req.json());
    return c.json({ markdown: renderContext(vault(), body.techIds) } satisfies ContextResponse);
  });

  app.post("/api/export", async (c) => {
    const body = exportRequestSchema.parse(await c.req.json()) as ExportRequest;
    return c.json(renderExport(vault(), body.stack, body.targets ?? ["agents", "claude"], (relPath) => body.existing?.[relPath] ?? null));
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

  app.get("/api/graph", (c) => c.json(buildGraph(vault(), { broken: c.req.query("broken") === "1" })));

  app.get("/api/config", (c) => c.json({ language: loadConfig().language }));

  app.post("/api/connect", async (c) => {
    const body = connectRequestSchema.parse(await c.req.json().catch(() => ({})));
    return c.json(connect({ vault: opts.root, ...body }));
  });

  app.get("/api/agents", (c) => c.json({ agents: listAgents() } satisfies AgentsResponse));

  /**
   * Run a coding agent headless with the `plan-stack` prompt, in a fresh empty directory so it
   * cannot write project files. Output is streamed on the shared SSE channel; the response only
   * carries the run id. One run at a time, so a second request while one is active returns 409.
   */
  app.post("/api/agents/run", async (c) => {
    const body = agentRunRequestSchema.parse(await c.req.json());
    const prompt = `${planStackPrompt(body.description, body.layers)}${AGENT_DECISION_SUFFIX}`;
    try {
      const runId = agentRunner.start(
        { agent: body.agent, model: body.model, prompt },
        {
          onChunk: (id, chunk) => opts.events?.publish({ type: "agent-run", runId: id, chunk }),
          onDone: (id, result) => opts.events?.publish({ type: "agent-run-done", runId: id, ...result }),
        },
      );
      return c.json({ runId } satisfies AgentRunStartResponse, 202);
    } catch (err) {
      if (err instanceof AgentBusyError) return c.json({ error: "conflict", message: err.message } satisfies ApiError, 409);
      if (err instanceof AgentUnavailableError) return c.json({ error: "invalid", message: err.message } satisfies ApiError, 400);
      throw err;
    }
  });

  app.post("/api/agents/run/:id/cancel", (c) => {
    if (!agentRunner.cancel(c.req.param("id"))) {
      return c.json({ error: "not_found", message: "no such agent run" } satisfies ApiError, 404);
    }
    return c.body(null, 204);
  });

  app.get("/api/embeddings", (c) => {
    const cfg = loadConfig();
    const v = vault();
    const index = loadIndex(v);
    return c.json({
      enabled: cfg.embeddings,
      runtime: runtimeInstalled(),
      model: cfg.embeddingsModel,
      indexed: index.notes,
      stale: index.stale(v).length,
      download: downloadSize(cfg.embeddingsModel),
    });
  });

  /**
   * One-click equivalent of `basics embeddings enable`: install the runtime, fetch the model
   * and sync the index. Progress is broadcast on the same SSE channel as ranking progress.
   * The download is real and can be large; failures (offline, no npm, missing runtime) return
   * a message the UI can show without changing the active mode.
   */
  app.post("/api/embeddings/enable", async (c) => {
    const cfg = loadConfig();
    const model = cfg.embeddingsModel;
    const onProgress = (done: number, total: number) => opts.events?.publish({ type: "embeddings", done, total });
    try {
      if (!runtimeInstalled()) await installRuntime();
      const runtime = await loadRuntime();
      if (!runtime) throw new Error(`embeddings runtime missing at ${runtimeDir()}`);
      const embedder = await loadEmbedderWithRetry(runtime, model);
      // Save the config only once the model loaded and the index synced, so a failed
      // enable never leaves `embeddings: true` behind pointing at a missing model.
      const stats = await syncIndex(vault(), embedder, onProgress);
      saveConfig(configSchema.parse({ ...cfg, embeddings: true, embeddingsModel: model }));
      return c.json({ enabled: true, model, indexed: stats.notes } satisfies EmbeddingsEnableResponse);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "internal", message } satisfies ApiError, 500);
    }
  });

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

  app.get("/api/packs", (c) => c.json(listPacks(packsDir(), vault())));

  app.post("/api/packs/add", async (c) => {
    const body = packAddRequestSchema.parse(await c.req.json());
    const slash = body.repo.indexOf("/");
    if (slash === -1) throw new PackDownloadError(`expected owner/repo, got "${body.repo}"`, "use owner/repo");
    const result = await addCommunityPack(vault(), {
      owner: body.repo.slice(0, slash),
      repo: body.repo.slice(slash + 1),
      ref: body.ref,
      path: body.path,
      lang: body.lang,
    });
    return c.json(result);
  });

  app.post("/api/packs/:name/install", async (c) => {
    const body = packInstallRequestSchema.parse(await c.req.json().catch(() => ({})));
    const lang = body.lang ?? loadConfig().language;
    return c.json(installPack(vault(), packsDir(), c.req.param("name"), { lang }));
  });

  app.post("/api/packs/:name/update", (c) => {
    return c.json(updatePack(vault(), packsDir(), c.req.param("name")));
  });

  app.post("/api/inbox/approve-all", async (c) => {
    const raw = await c.req.text();
    const body = approveAllRequestSchema.parse(raw.trim() ? JSON.parse(raw) : {});
    return c.json(vault().approveMany(body) satisfies ApproveAllResponse);
  });

  app.post("/api/inbox/reject-all", async (c) => {
    const raw = await c.req.text();
    const body = approveAllRequestSchema.parse(raw.trim() ? JSON.parse(raw) : {});
    return c.json(vault().rejectMany(body) satisfies RejectAllResponse);
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
      // A missing hashed asset (an old build's chunk) must 404, not fall back to index.html,
      // so the client sees a real load error and can reload onto the new build.
      if (c.req.path.startsWith("/api") || c.req.path.startsWith("/mcp") || c.req.path.startsWith("/assets/")) {
        return c.notFound();
      }
      const res = await serveStatic({ root: uiDir, path: path.join("index.html") })(c, async () => {});
      // index.html names the current chunks; never let the browser cache it.
      res?.headers.set("Cache-Control", "no-cache");
      return res ?? c.notFound();
    });
  }

  return app;
}
