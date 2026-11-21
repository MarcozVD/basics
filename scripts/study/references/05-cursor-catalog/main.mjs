import http from "node:http";

const items = [];
const fail = (status, message) => Object.assign(new Error(message), { status });
async function readBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 65536) throw fail(413, "Body too large");
  }
  return raw;
}
const compare = (sort, dir) => (a, b) => {
  const k = a[sort] < b[sort] ? -1 : a[sort] > b[sort] ? 1 : 0;
  if (k !== 0) return dir === "asc" ? k : -k;
  return a.id - b.id;
};
function handle(request, raw, send) {
  const url = new URL(request.url, "http://local");
  if (url.pathname !== "/items") throw fail(404, "Not found");
  if (request.method === "POST") {
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw fail(400, "Malformed JSON");
    }
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).sort().join() !== "name,price" ||
      typeof value.name !== "string" ||
      value.name === "" ||
      value.name.length > 80 ||
      !Number.isSafeInteger(value.price) ||
      value.price < 0
    )
      throw fail(400, "Invalid item");
    const item = { id: items.length + 1, name: value.name, price: value.price };
    items.push(item);
    return send(201, item);
  }
  if (request.method !== "GET") throw fail(404, "Not found");
  for (const key of url.searchParams.keys())
    if (!["sort", "dir", "limit", "cursor"].includes(key)) throw fail(400, "Unknown query parameter");
  const sort = url.searchParams.get("sort") ?? "name",
    dir = url.searchParams.get("dir") ?? "asc",
    limitText = url.searchParams.get("limit") ?? "10";
  if (!["name", "price"].includes(sort) || !["asc", "desc"].includes(dir) || !/^\d+$/.test(limitText)) throw fail(400, "Invalid query");
  const limit = Number(limitText);
  if (limit < 1 || limit > 50) throw fail(400, "Invalid limit");
  const order = compare(sort, dir);
  let rest = [...items].sort(order);
  const encoded = url.searchParams.get("cursor");
  if (encoded !== null) {
    let cursor;
    try {
      cursor = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    } catch {
      throw fail(400, "Invalid cursor");
    }
    if (
      !cursor ||
      cursor.sort !== sort ||
      cursor.dir !== dir ||
      !Number.isSafeInteger(cursor.id) ||
      !(typeof cursor.key === "string" || Number.isSafeInteger(cursor.key)) ||
      typeof cursor.key !== (sort === "name" ? "string" : "number")
    )
      throw fail(400, "Invalid cursor");
    const position = { id: cursor.id, [sort]: cursor.key };
    rest = rest.filter((item) => order(item, position) > 0);
  }
  const more = rest.length > limit;
  const page = rest.slice(0, limit);
  const last = page.at(-1);
  const next_cursor = more ? Buffer.from(JSON.stringify({ sort, dir, key: last[sort], id: last.id })).toString("base64url") : null;
  send(200, { items: page, next_cursor });
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
