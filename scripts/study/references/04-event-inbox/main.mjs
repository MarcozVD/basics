import http from "node:http";

const events = new Map();
const fail = (status, message) => Object.assign(new Error(message), { status });
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
async function readBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 65536) throw fail(413, "Body too large");
  }
  return raw;
}
function validate(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw fail(400, "Malformed JSON");
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== "at,id,payload,type")
    throw fail(400, "Invalid fields");
  if (typeof value.id !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(value.id)) throw fail(400, "Invalid id");
  if (typeof value.type !== "string" || value.type === "" || value.type.length > 40) throw fail(400, "Invalid type");
  if (!Number.isSafeInteger(value.at) || value.at < 0) throw fail(400, "Invalid at");
  if (!value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) throw fail(400, "Invalid payload");
  return { id: value.id, type: value.type, at: value.at, payload: value.payload };
}
function handle(request, raw, send) {
  const url = new URL(request.url, "http://local"),
    parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] === "events" && parts.length === 1 && request.method === "POST") {
    const event = validate(raw),
      existing = events.get(event.id);
    if (existing) {
      if (same(existing, event)) return send(200, existing);
      throw fail(409, "Conflicting duplicate");
    }
    events.set(event.id, event);
    return send(201, event);
  }
  if (parts[0] === "events" && parts.length === 1 && request.method === "GET") {
    for (const key of url.searchParams.keys()) if (key !== "type") throw fail(400, "Unknown query parameter");
    const type = url.searchParams.get("type");
    const items = [...events.values()]
      .filter((event) => type === null || event.type === type)
      .sort((a, b) => a.at - b.at || order(a.id, b.id));
    return send(200, { items, total: items.length });
  }
  if (parts[0] === "events" && parts.length === 2 && request.method === "GET") {
    if (!events.has(parts[1])) throw fail(404, "Unknown event");
    return send(200, events.get(parts[1]));
  }
  throw fail(404, "Not found");
}
http
  .createServer(async (request, response) => {
    const send = (code, value) => {
      response.writeHead(code, { "content-type": "application/json" });
      response.end(JSON.stringify(value));
    };
    try {
      handle(request, await readBody(request), send);
    } catch (error) {
      send(error.status ?? 400, { error: error.message });
    }
  })
  .listen(Number(process.env.PORT), "127.0.0.1");
