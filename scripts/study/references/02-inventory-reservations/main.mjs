import http from "node:http";

const items = new Map(),
  keys = new Map(),
  reservations = new Map();
let next = 1;
const fail = (status, message) => Object.assign(new Error(message), { status });
const int = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
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
  const body = () => {
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw fail(400, "Malformed JSON");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw fail(400, "Expected an object");
    return value;
  };
  if (parts[0] === "items" && parts.length === 2) {
    const sku = parts[1];
    if (request.method === "GET") {
      if (!items.has(sku)) throw fail(404, "Unknown item");
      return send(200, { sku, available: items.get(sku) });
    }
    if (request.method === "PUT") {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(sku)) throw fail(400, "Invalid sku");
      const value = body();
      if (Object.keys(value).join() !== "stock" || !int(value.stock, 0, 1000000000)) throw fail(400, "Invalid stock");
      if (items.has(sku)) throw fail(409, "Item exists");
      items.set(sku, value.stock);
      return send(201, { sku, available: value.stock });
    }
  }
  if (parts[0] === "items" && parts[2] === "reserve" && parts.length === 3 && request.method === "POST") {
    const sku = parts[1],
      key = request.headers["idempotency-key"];
    if (typeof key !== "string" || key.length < 1 || key.length > 64) throw fail(400, "Idempotency-Key required");
    const value = body();
    if (Object.keys(value).join() !== "quantity" || !int(value.quantity, 1, 1000)) throw fail(400, "Invalid quantity");
    if (!items.has(sku)) throw fail(404, "Unknown item");
    const known = keys.get(key);
    if (known) {
      if (known.sku !== sku || known.quantity !== value.quantity) throw fail(422, "Key reused with a different request");
      return send(201, known.body);
    }
    if (items.get(sku) < value.quantity) throw fail(409, "Insufficient stock");
    items.set(sku, items.get(sku) - value.quantity);
    const reservation = { reservation_id: `r${next++}`, sku, quantity: value.quantity, status: "active" };
    reservations.set(reservation.reservation_id, { sku, quantity: value.quantity, released: false });
    keys.set(key, { sku, quantity: value.quantity, body: reservation });
    return send(201, reservation);
  }
  if (parts[0] === "reservations" && parts[2] === "release" && parts.length === 3 && request.method === "POST") {
    const reservation = reservations.get(parts[1]);
    if (!reservation) throw fail(404, "Unknown reservation");
    if (!reservation.released) {
      items.set(reservation.sku, items.get(reservation.sku) + reservation.quantity);
      reservation.released = true;
    }
    return send(200, { reservation_id: parts[1], sku: reservation.sku, quantity: reservation.quantity, status: "released" });
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
