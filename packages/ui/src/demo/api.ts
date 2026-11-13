import type {
  ActivityEvent,
  GraphData,
  NoteData,
  NoteDetail,
  NoteSummary,
  ProposalDetail,
  Recommendation,
  VaultStats,
} from "@marcozvd/basics-core";
import { snapshotKey } from "../../../../scripts/demo/key.mjs";

export interface RecordedResponse {
  status: number;
  body: unknown;
}
export type Snapshot = Record<string, RecordedResponse>;

const types = ["layer", "tech", "practice", "check", "profile", "project"] as const;
const slug = (text: string) =>
  text
    .replace(/^\[\[|\]\]$/g, "")
    .split(/[|#]/)[0]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9.+#]+/g, "-")
    .replace(/^-+|-+$/g, "");
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const missing = () => json({ error: "not_found", message: "Not available in the demo" }, 404);

function links(data: NoteData, body: string): string[] {
  const refs: string[] = [];
  const add = (value: string | string[] | undefined) => {
    if (value) refs.push(...[value].flat());
  };
  if (data.type === "tech") {
    for (const field of [data.layer, data.language, data.related, data.practices, data.checks]) add(field);
  } else if (data.type === "practice" || data.type === "check") add(data.applies_to);
  else if (data.type === "profile" || data.type === "project") {
    if (data.type === "project") add(data.profile);
    for (const [layer, techs] of Object.entries(data.stack)) {
      add(layer);
      add(techs);
    }
  }
  for (const match of body.matchAll(/\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/g)) add(match[1]);
  return [...new Set(refs.map(slug).filter(Boolean))];
}

function summary(note: NoteDetail): NoteSummary {
  const data = note.data;
  return {
    id: note.id,
    type: data.type,
    title: data.title ?? note.id,
    layers: data.type === "tech" ? [data.layer].flat().map(slug) : [],
    kind: data.type === "tech" ? data.kind : undefined,
    source: data.source,
    updated: data.updated,
    tags: data.tags ?? [],
    excerpt:
      (data.type === "tech" ? data.use_when?.[0] : undefined) ??
      note.body
        .split("\n")
        .find((line) => line.trim() && !line.startsWith("#"))
        ?.slice(0, 120),
    project: data.type === "project" ? data : undefined,
  };
}

/** Own one reload-scoped copy. No server, disk writes, downloads, or persistent mutation storage. */
export async function createDemoApi(snapshot: Snapshot, onChange: () => void = () => {}) {
  const read = async <T>(route: string): Promise<T> => structuredClone(snapshot[await snapshotKey("GET", route)].body as T);
  const notes = new Map<string, NoteDetail>();
  for (const note of await read<NoteSummary[]>("/api/notes")) notes.set(note.id, await read(`/api/notes/${encodeURIComponent(note.id)}`));
  const proposals = new Map<string, ProposalDetail>();
  for (const proposal of await read<{ id: string }[]>("/api/inbox"))
    proposals.set(proposal.id, await read(`/api/inbox/${encodeURIComponent(proposal.id)}`));
  let config = await read<{ language: "en" | "es" }>("/api/config");
  const activity = snapshot[await snapshotKey("GET", "/api/activity")]?.body as ActivityEvent[] | undefined;
  let changed = false;

  const all = () => [...notes.values()].map(summary).sort((a, b) => a.type.localeCompare(b.type) || a.title.localeCompare(b.title));
  function reconnect() {
    for (const note of notes.values()) {
      note.links = links(note.data, note.body);
    }
    // Backlinks must see every note's new outgoing links, including edits later in insertion order.
    for (const note of notes.values())
      note.backlinks = [...notes.values()].filter((other) => other.links.includes(note.id)).map((other) => other.id);
  }
  const notify = () => {
    changed = true;
    onChange();
  };
  function conflict(note: NoteDetail | undefined, expectedHash: unknown) {
    return note && expectedHash && expectedHash !== note.hash
      ? json({ error: "conflict", message: "Note changed; reload it before saving", actualHash: note.hash }, 409)
      : null;
  }
  async function save(id: string, data: NoteData, body: string) {
    const stamped = { ...data, updated: new Date().toISOString().slice(0, 10) };
    const hash = (await snapshotKey("NOTE", "/", { data: stamped, body })).split(" ").at(-1)!;
    const directory =
      data.type === "layer"
        ? "layers"
        : data.type === "practice"
          ? "practices"
          : data.type === "check"
            ? "checks"
            : data.type === "profile"
              ? "profiles"
              : data.type === "project"
                ? "projects"
                : "tech";
    const note: NoteDetail = {
      id,
      type: data.type,
      data: stamped,
      body,
      links: [],
      backlinks: [],
      hash,
      path: notes.get(id)?.path ?? `${directory}/${id}.md`,
    };
    notes.set(id, note);
    reconnect();
    return note;
  }
  function graph(broken: boolean): GraphData {
    const edges: GraphData["edges"] = [];
    const seen = new Set<string>();
    const absent = new Set<string>();
    for (const note of notes.values())
      for (const target of note.links) {
        if (note.id === target || (!notes.has(target) && !broken)) continue;
        const key = [note.id, target].sort().join("|");
        if (seen.has(key)) continue;
        seen.add(key);
        if (!notes.has(target)) absent.add(target);
        edges.push({ source: note.id, target, kind: notes.has(target) ? "link" : "broken" });
      }
    const degree = (id: string) => edges.filter((edge) => edge.source === id || edge.target === id).length;
    const nodes: GraphData["nodes"] = all().map((note) => {
      const data = notes.get(note.id)!.data;
      let group: string | undefined = note.layers[0];
      if (data.type === "practice" || data.type === "check") {
        const groups = new Set(
          data.applies_to.map((id) => {
            const target = notes.get(slug(id));
            return target?.data.type === "tech" ? [target.data.layer].flat().map(slug)[0] : undefined;
          }),
        );
        group = groups.size === 1 ? [...groups][0] : undefined;
      }
      return { id: note.id, type: note.type, title: note.title, layers: note.layers, group, degree: degree(note.id) };
    });
    for (const id of [...absent].sort()) nodes.push({ id, type: "missing", title: id, layers: [], degree: degree(id) });
    return { nodes, edges };
  }
  async function approve(id: string, override: { data?: NoteData; body?: string } = {}) {
    const proposal = proposals.get(id);
    if (!proposal) return missing();
    const error = conflict(notes.get(id), proposal.meta.base_hash);
    if (error) return error;
    const agent = proposal.meta.proposed_by;
    const source = agent.startsWith("agent:") || agent.startsWith("pack:") ? agent : `agent:${agent}`;
    const note = await save(id, { ...(override.data ?? proposal.data), source }, override.body ?? proposal.body);
    proposals.delete(id);
    return json(note);
  }

  return async function request(method: string, route: string, body?: unknown): Promise<Response> {
    const url = new URL(route, "https://demo.invalid");
    const path = url.pathname;
    const input = (body ?? {}) as {
      id?: string;
      data?: NoteData;
      body?: string;
      expectedHash?: string;
      language?: "en" | "es";
      description?: string;
      layers?: string[];
      perLayer?: number;
      ids?: string[];
      agent?: string;
      action?: string;
      pack?: string;
      version?: string;
    };
    if (path === "/api/events") return new Response(null, { status: 204 });
    if (path === "/api/config") {
      if (method === "PUT" && (input.language === "en" || input.language === "es")) config = { language: input.language };
      if (method === "GET" || method === "PUT") return json(config);
    }
    const noteMatch = path.match(/^\/api\/notes\/([^/]+)$/);
    const proposalMatch = path.match(/^\/api\/inbox\/([^/]+)(?:\/(approve|reject))?$/);
    if (method === "GET") {
      if (path === "/api/activity")
        return json(
          (activity ?? [])
            .filter(
              (entry) =>
                (!url.searchParams.get("note") || entry.noteIds.includes(url.searchParams.get("note")!)) &&
                (!url.searchParams.get("agent") || entry.agent === url.searchParams.get("agent")),
            )
            .slice(0, Number(url.searchParams.get("limit") ?? 50)),
        );
      if (path === "/api/inbox")
        return json(
          [...proposals.values()].map((proposal) => ({
            id: proposal.id,
            type: proposal.data.type,
            title: proposal.data.title ?? proposal.id,
            meta: proposal.meta,
          })),
        );
      if (proposalMatch) {
        const proposal = proposals.get(decodeURIComponent(proposalMatch[1]));
        if (!proposal) return missing();
        const detail = structuredClone(proposal);
        const current = notes.get(proposal.id);
        if (current?.hash !== detail.current?.hash) {
          const data = current ? { ...current.data } : null;
          if (data) delete data.updated;
          detail.current =
            current && data
              ? {
                  data: current.data,
                  body: current.body,
                  hash: current.hash,
                  text: `---\n${Object.entries(data)
                    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
                    .join("\n")}\n---\n${current.body.trim()}\n`,
                }
              : null;
        }
        return json(detail);
      }
      if (noteMatch) return notes.has(decodeURIComponent(noteMatch[1])) ? json(notes.get(decodeURIComponent(noteMatch[1]))) : missing();
      if (path === "/api/notes" || path === "/api/search") {
        const query = (url.searchParams.get("q") ?? "").toLowerCase().trim().split(/\s+/).filter(Boolean);
        const filtered = all().filter(
          (note) =>
            (!url.searchParams.get("type") || note.type === url.searchParams.get("type")) &&
            (!url.searchParams.get("layer") || note.layers.includes(url.searchParams.get("layer")!)),
        );
        if (path === "/api/notes") return json(filtered);
        return json(
          filtered
            .filter((note) =>
              query.every((term) =>
                `${note.id} ${note.title} ${JSON.stringify(notes.get(note.id)!.data)} ${notes.get(note.id)!.body}`
                  .toLowerCase()
                  .includes(term),
              ),
            )
            .map((note) => ({ id: note.id, type: note.type, title: note.title, score: 1 })),
        );
      }
      if (changed && path === "/api/layers")
        return json(
          all()
            .filter((note) => note.type === "layer")
            .map((layer) => ({
              id: layer.id,
              title: layer.title,
              techs: all()
                .filter((note) => note.layers.includes(layer.id))
                .map((note) => note.id),
            })),
        );
      if (changed && path === "/api/graph") return json(graph(url.searchParams.get("broken") === "1"));
      if (changed && path === "/api/stats") {
        const counts = Object.fromEntries(
          types.map((type) => [type, all().filter((note) => note.type === type).length]),
        ) as VaultStats["counts"];
        return json({
          counts,
          total: notes.size,
          inbox: proposals.size,
          brokenLinks: [...notes.values()].flatMap((note) =>
            note.links.filter((id) => !notes.has(id)).map((to) => ({ from: note.id, to })),
          ),
          orphans: [...notes.values()].filter((note) => !note.links.length && !note.backlinks.length).map((note) => note.id),
          recent: all()
            .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""))
            .slice(0, 6),
        } satisfies VaultStats);
      }
    }
    if ((method === "POST" && path === "/api/notes") || (method === "PUT" && noteMatch)) {
      const id = noteMatch ? decodeURIComponent(noteMatch[1]) : input.id;
      if (!id || slug(id) !== id || !input.data || !types.includes(input.data.type) || typeof input.body !== "string")
        return json({ error: "invalid", message: "Invalid demo note" }, 400);
      if (method === "POST" && notes.has(id)) return json({ error: "exists", message: "Note already exists" }, 409);
      if (method === "PUT" && !notes.has(id)) return missing();
      const error = conflict(notes.get(id), input.expectedHash);
      if (error) return error;
      const note = await save(id, input.data, input.body);
      notify();
      return json(note, method === "POST" ? 201 : 200);
    }
    if (method === "DELETE" && noteMatch) {
      const id = decodeURIComponent(noteMatch[1]);
      if (!notes.has(id)) return missing();
      const error = conflict(notes.get(id), url.searchParams.get("expectedHash"));
      if (error) return error;
      notes.delete(id);
      reconnect();
      notify();
      return new Response(null, { status: 204 });
    }
    if (method === "POST" && (path === "/api/inbox/approve-all" || path === "/api/inbox/reject-all")) {
      const selected = [...proposals.values()].filter(
        (proposal) =>
          (!input.ids || input.ids.includes(proposal.id)) &&
          (!input.agent || proposal.meta.proposed_by === input.agent) &&
          (!input.action || proposal.meta.action === input.action) &&
          (!input.pack || proposal.meta.proposed_by === `pack:${input.pack}${input.version ? `@${input.version}` : ""}`),
      );
      const completed: string[] = [];
      const failed: { id: string; error: string }[] = [];
      for (const proposal of selected) {
        if (path.endsWith("approve-all")) {
          const response = await approve(proposal.id);
          if (!response.ok) {
            failed.push({ id: proposal.id, error: ((await response.json()) as { message: string }).message });
            continue;
          }
        } else proposals.delete(proposal.id);
        completed.push(proposal.id);
      }
      notify();
      return json(path.endsWith("approve-all") ? { approved: completed, failed } : { rejected: completed, failed });
    }
    if (method === "POST" && proposalMatch?.[2]) {
      const id = decodeURIComponent(proposalMatch[1]);
      if (!proposals.has(id)) return missing();
      if (proposalMatch[2] === "approve") {
        const response = await approve(id, input);
        if (response.ok) notify();
        return response;
      }
      proposals.delete(id);
      notify();
      return new Response(null, { status: 204 });
    }
    const recorded = snapshot[await snapshotKey(method, route, body)];
    if (recorded && !(changed && path === "/api/recommend")) return json(recorded.body, recorded.status);
    if (method === "POST" && path === "/api/recommend") {
      // Preset descriptions are fixed recordings; layer/per-layer controls only narrow their result.
      const result = Object.entries(snapshot).find(
        ([key, value]) =>
          key.startsWith("POST /api/recommend ") &&
          (value.body as Recommendation).description?.trim().toLowerCase() === input.description?.trim().toLowerCase(),
      );
      if (result) {
        const recommendation = structuredClone(result[1].body as Recommendation);
        recommendation.layers = Object.fromEntries(
          Object.entries(recommendation.layers)
            .filter(([layer]) => !input.layers || input.layers.includes(layer))
            .map(([layer, candidates]) => [layer, candidates.filter((candidate) => notes.has(candidate.id)).slice(0, input.perLayer ?? 3)]),
        );
        recommendation.profiles = recommendation.profiles.filter((profile) => notes.has(profile.id));
        return json(recommendation);
      }
    }
    return missing();
  };
}

/** Install before importing/rendering the app. Every /api request terminates here, including unknowns. */
export async function installDemoFetch(snapshot: Snapshot, onChange: () => void) {
  const request = await createDemoApi(snapshot, onChange);
  const networkFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    if (!url.pathname.startsWith("/api")) return networkFetch(input, init);
    if (init?.signal?.aborted || (input instanceof Request && input.signal.aborted)) throw new DOMException("Aborted", "AbortError");
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const raw = init?.body ?? (input instanceof Request && method !== "GET" && method !== "HEAD" ? await input.clone().text() : undefined);
    try {
      return await request(method, `${url.pathname}${url.search}`, typeof raw === "string" && raw ? JSON.parse(raw) : undefined);
    } catch {
      return json({ error: "invalid", message: "Invalid demo request" }, 400);
    }
  };
  // EventSource bypasses fetch. An inert local instance prevents SSE retries or real API traffic.
  class DemoEventSource extends EventTarget {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSED = 2;
    readonly readyState = 2;
    readonly withCredentials = false;
    onopen = null;
    onerror = null;
    onmessage = null;
    constructor(readonly url: string) {
      super();
    }
    close() {}
  }
  Object.defineProperty(window, "EventSource", { configurable: true, value: DemoEventSource });
}
