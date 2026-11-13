import type { NoteDetail, ProposalDetail } from "@marcozvd/basics-core";
import { noteSchema } from "@marcozvd/basics-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { snapshotKey } from "../../../scripts/demo/key.mjs";
import { createDemoApi, installDemoFetch, type Snapshot } from "../src/demo/api";

async function fixture() {
  const snapshot: Snapshot = {};
  const data = noteSchema.parse({ type: "practice", title: "Testing note", applies_to: [] });
  const note: NoteDetail = {
    id: "testing-note",
    type: "practice",
    data,
    body: "Original body",
    hash: "original-hash",
    path: "practices/testing-note.md",
    links: [],
    backlinks: [],
  };
  const proposal = (id: string, action: "create" | "update", agent: string): ProposalDetail => ({
    id,
    data: { ...data, title: id },
    body: "Proposed body [[testing-note]]",
    proposedText: "Recorded diff text",
    meta: {
      action,
      proposed_by: agent,
      reason: "Improve test setup",
      created: "2026-11-12T12:00:00.000Z",
      ...(action === "update" ? { base_hash: note.hash } : {}),
    },
    current: action === "update" ? { data, body: note.body, hash: note.hash, text: note.body } : null,
  });
  const proposals = [
    proposal("testing-note", "update", "claude-code"),
    proposal("new-note", "create", "codex"),
    proposal("other-note", "create", "opencode"),
  ];
  for (const [route, body] of [
    ["/api/notes", [{ id: note.id }]],
    ["/api/notes/testing-note", note],
    ["/api/inbox", proposals.map((entry) => ({ id: entry.id }))],
    ...proposals.map((entry) => [`/api/inbox/${entry.id}`, entry]),
    ["/api/config", { language: "en" }],
    ["/api/health", { ok: true, vault: "/demo-vault" }],
  ] as [string, unknown][])
    snapshot[await snapshotKey("GET", route)] = { status: 200, body };
  return { snapshot, note };
}

afterEach(() => vi.unstubAllGlobals());

describe("reload-scoped demo API", () => {
  it("approves recorded proposals, stamps source, updates notes/graph/stats, and resets with a new instance", async () => {
    const { snapshot } = await fixture();
    const changed = vi.fn();
    const api = await createDemoApi(snapshot, changed);
    const approved = await api("POST", "/api/inbox/new-note/approve", {});
    expect(approved.status).toBe(200);
    expect(await approved.json()).toMatchObject({ id: "new-note", data: { source: "agent:codex" } });
    expect(await (await api("GET", "/api/inbox")).json()).toHaveLength(2);
    expect(await (await api("GET", "/api/notes/testing-note")).json()).toMatchObject({ backlinks: ["new-note"] });
    expect(await (await api("GET", "/api/graph")).json()).toMatchObject({
      edges: [{ source: "new-note", target: "testing-note", kind: "link" }],
    });
    expect(await (await api("GET", "/api/stats")).json()).toMatchObject({ total: 2, inbox: 2, counts: { practice: 2 } });
    expect(changed).toHaveBeenCalledOnce();
    const reset = await createDemoApi(snapshot);
    expect((await reset("GET", "/api/notes/new-note")).status).toBe(404);
    expect(await (await reset("GET", "/api/inbox")).json()).toHaveLength(3);
  });

  it("creates, searches, updates and deletes notes with conflict checks and backlink updates", async () => {
    const { snapshot, note } = await fixture();
    const api = await createDemoApi(snapshot);
    const payload = { id: "local-note", data: { ...note.data, title: "Local recipe" }, body: "Build [[testing-note]] carefully" };
    const created = await (await api("POST", "/api/notes", payload)).json();
    expect((await api("POST", "/api/notes", payload)).status).toBe(409);
    expect(await (await api("GET", "/api/search?q=recipe&type=practice")).json()).toMatchObject([
      { id: "local-note", title: "Local recipe" },
    ]);
    expect(await (await api("GET", "/api/notes/testing-note")).json()).toMatchObject({ backlinks: ["local-note"] });
    expect((await api("PUT", "/api/notes/local-note", { ...payload, expectedHash: "wrong" })).status).toBe(409);
    expect((await api("PUT", "/api/notes/local-note", { ...payload, body: "Updated recipe", expectedHash: created.hash })).status).toBe(
      200,
    );
    expect(await (await api("GET", "/api/notes/testing-note")).json()).toMatchObject({ backlinks: [] });
    expect((await api("DELETE", "/api/notes/local-note?expectedHash=wrong")).status).toBe(409);
    expect((await api("DELETE", "/api/notes/local-note")).status).toBe(204);
    expect(await (await api("GET", "/api/search?q=recipe")).json()).toEqual([]);
    expect((await api("GET", "/api/notes/local-note")).status).toBe(404);
  });

  it("scopes bulk review by ids, agent and action; rejects without writing notes", async () => {
    const { snapshot } = await fixture();
    const api = await createDemoApi(snapshot);
    expect(await (await api("POST", "/api/inbox/approve-all", { agent: "codex", action: "create" })).json()).toEqual({
      approved: ["new-note"],
      failed: [],
    });
    expect(await (await api("POST", "/api/inbox/reject-all", { ids: ["other-note"] })).json()).toEqual({
      rejected: ["other-note"],
      failed: [],
    });
    expect((await api("GET", "/api/notes/other-note")).status).toBe(404);
    expect((await api("POST", "/api/inbox/testing-note/reject")).status).toBe(204);
    expect(await (await api("GET", "/api/inbox")).json()).toEqual([]);
    expect((await api("POST", "/api/inbox/testing-note/reject")).status).toBe(404);
  });

  it("preserves a stale update proposal for review and reports bulk failures", async () => {
    const { snapshot, note } = await fixture();
    const api = await createDemoApi(snapshot);
    await api("PUT", "/api/notes/testing-note", { data: note.data, body: "Local change", expectedHash: note.hash });
    expect(await (await api("GET", "/api/inbox/testing-note")).json()).toMatchObject({ current: { body: "Local change" } });
    expect((await api("POST", "/api/inbox/testing-note/approve", {})).status).toBe(409);
    const response = await (await api("POST", "/api/inbox/approve-all", { ids: ["testing-note", "new-note"] })).json();
    expect(response.approved).toEqual(["new-note"]);
    expect(response.failed).toMatchObject([{ id: "testing-note" }]);
    expect((await api("GET", "/api/inbox/testing-note")).status).toBe(200);
  });

  it("keeps language in memory, returns recorded responses and handles unknown routes quietly", async () => {
    const { snapshot } = await fixture();
    const api = await createDemoApi(snapshot);
    expect(await (await api("PUT", "/api/config", { language: "es" })).json()).toEqual({ language: "es" });
    expect(await (await api("GET", "/api/config")).json()).toEqual({ language: "es" });
    expect(await (await api("GET", "/api/health")).json()).toMatchObject({ ok: true });
    expect((await api("GET", "/api/events")).status).toBe(204);
    expect((await api("POST", "/api/embeddings/enable")).status).toBe(404);
    expect((await api("GET", "/api/unknown")).status).toBe(404);
  });

  it("does not serve recorded recommendations, even if an old snapshot contains one", async () => {
    const { snapshot } = await fixture();
    const input = { description: "A recorded preset", perLayer: 2 };
    snapshot[await snapshotKey("POST", "/api/recommend", input)] = {
      status: 200,
      body: { description: input.description, profiles: [], layers: { backend: [{ id: "testing-note" }] } },
    };
    const api = await createDemoApi(snapshot);
    expect((await api("POST", "/api/recommend", { ...input, layers: ["frontend"] })).status).toBe(404);
    expect((await api("POST", "/api/recommend", input)).status).toBe(404);
  });

  it("intercepts fetch and EventSource without allowing API requests to reach a server", async () => {
    const { snapshot } = await fixture();
    const network = vi.fn(async () => new Response("asset"));
    vi.stubGlobal("fetch", network);
    vi.stubGlobal("window", { location: { href: "https://demo.invalid/basics/demo/" } });
    await installDemoFetch(snapshot, () => {});
    expect((await fetch("/api/unknown")).status).toBe(404);
    expect((await fetch(new Request("https://external.invalid/api/health"))).status).toBe(200);
    expect((await fetch("/api/notes", { method: "POST", body: "invalid json" })).status).toBe(400);
    const source = new window.EventSource("/api/events");
    expect(source.readyState).toBe(2);
    source.close();
    expect(network).not.toHaveBeenCalled();
    await fetch("/basics/demo/assets/example.js");
    expect(network).toHaveBeenCalledOnce();
  });
});
