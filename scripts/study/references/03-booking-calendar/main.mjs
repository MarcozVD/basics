import http from "node:http";

const bookings = new Map();
let next = 1;
const fail = (status, message) => Object.assign(new Error(message), { status });
const stamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const instant = (value) => {
  const time = typeof value === "string" && stamp.test(value) ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(time)) throw fail(400, "Invalid timestamp");
  return time;
};
async function readBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 65536) throw fail(413, "Body too large");
  }
  return raw;
}
function handle(request, raw, send) {
  const parts = new URL(request.url, "http://local").pathname.split("/").filter(Boolean);
  if (parts[0] === "resources" && parts[2] === "bookings" && parts.length === 3) {
    const resource = parts[1];
    if (!/^[a-z0-9-]{1,40}$/.test(resource)) throw fail(400, "Invalid resource");
    if (request.method === "GET") {
      const items = [...bookings.values()]
        .filter((booking) => booking.resource === resource)
        .sort((a, b) => a.startMs - b.startMs || a.order - b.order)
        .map(({ id, resource: name, start, end }) => ({ id, resource: name, start, end }));
      return send(200, { items });
    }
    if (request.method === "POST") {
      let value;
      try {
        value = JSON.parse(raw);
      } catch {
        throw fail(400, "Malformed JSON");
      }
      if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== "end,start")
        throw fail(400, "Expected start and end");
      const startMs = instant(value.start),
        endMs = instant(value.end);
      if (endMs <= startMs) throw fail(400, "End must be after start");
      for (const other of bookings.values())
        if (other.resource === resource && startMs < other.endMs && other.startMs < endMs) throw fail(409, "Overlapping booking");
      const order = next++;
      const booking = {
        id: `b${order}`,
        resource,
        start: new Date(startMs).toISOString(),
        end: new Date(endMs).toISOString(),
        startMs,
        endMs,
        order,
      };
      bookings.set(booking.id, booking);
      return send(201, { id: booking.id, resource, start: booking.start, end: booking.end });
    }
  }
  if (parts[0] === "bookings" && parts.length === 2 && request.method === "DELETE") {
    if (!bookings.delete(parts[1])) throw fail(404, "Unknown booking");
    return send(204);
  }
  throw fail(404, "Not found");
}
http
  .createServer(async (request, response) => {
    const send = (code, value) => {
      response.writeHead(code, { "content-type": "application/json" });
      response.end(code === 204 ? undefined : JSON.stringify(value));
    };
    try {
      handle(request, await readBody(request), send);
    } catch (error) {
      send(error.status ?? 400, { error: error.message });
    }
  })
  .listen(Number(process.env.PORT), "127.0.0.1");
