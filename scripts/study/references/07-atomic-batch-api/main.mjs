import http from "node:http";

const records = new Map();
const fail = (status, message, extra = {}) => Object.assign(new Error(message), { status, extra });
const idPattern = /^[A-Za-z0-9_-]{1,64}$/;
async function readBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 262144) throw fail(413, "Body too large");
  }
  return raw;
}
const exact = (value, keys) =>
  value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join() === keys.sort().join();
function validateOperation(op, index) {
  const bad = () => fail(400, "Invalid operation", { index });
  if (!op || typeof op !== "object" || Array.isArray(op)) throw bad();
  const withValue = (keys) => exact(op, keys) && typeof op.id === "string" && idPattern.test(op.id);
  if (op.op === "create") {
    if (!withValue(["op", "id", "value"]) || typeof op.value !== "string" || op.value.length > 200) throw bad();
  } else if (op.op === "update") {
    if (
      !withValue(["op", "id", "value", "rev"]) ||
      typeof op.value !== "string" ||
      op.value.length > 200 ||
      !Number.isSafeInteger(op.rev) ||
      op.rev < 1
    )
      throw bad();
  } else if (op.op === "delete") {
    if (!withValue(["op", "id", "rev"]) || !Number.isSafeInteger(op.rev) || op.rev < 1) throw bad();
  } else throw bad();
}
function handle(request, raw, send) {
  const parts = new URL(request.url, "http://local").pathname.split("/").filter(Boolean);
  if (parts[0] === "records" && parts.length === 1 && request.method === "GET")
    return send(200, { items: [...records.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) });
  if (parts[0] === "records" && parts.length === 2 && request.method === "GET") {
    if (!records.has(parts[1])) throw fail(404, "Unknown record");
    return send(200, records.get(parts[1]));
  }
  if (parts[0] === "batch" && parts.length === 1 && request.method === "POST") {
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw fail(400, "Malformed JSON");
    }
    if (!exact(value, ["operations"]) || !Array.isArray(value.operations) || value.operations.length < 1 || value.operations.length > 50)
      throw fail(400, "Invalid batch");
    value.operations.forEach(validateOperation);
    const working = new Map([...records].map(([id, record]) => [id, { ...record }])),
      results = [];
    for (const [index, op] of value.operations.entries()) {
      const current = working.get(op.id);
      if (op.op === "create") {
        if (current) throw fail(409, "Record exists", { index });
        working.set(op.id, { id: op.id, value: op.value, rev: 1 });
        results.push({ id: op.id, rev: 1 });
      } else {
        if (!current) throw fail(409, "Unknown record", { index });
        if (current.rev !== op.rev) throw fail(409, "Stale revision", { index });
        if (op.op === "update") {
          current.value = op.value;
          current.rev++;
          results.push({ id: op.id, rev: current.rev });
        } else {
          working.delete(op.id);
          results.push({ id: op.id, rev: null });
        }
      }
    }
    records.clear();
    for (const [id, record] of working) records.set(id, record);
    return send(200, { results });
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
      send(error.status ?? 400, { error: error.message, ...error.extra });
    }
  })
  .listen(Number(process.env.PORT), "127.0.0.1");
