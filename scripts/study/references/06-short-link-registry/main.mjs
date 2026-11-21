import http from "node:http";

const links = new Map();
const fail = (status, message) => Object.assign(new Error(message), { status });
async function readBody(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 65536) throw fail(413, "Body too large");
  }
  return raw;
}
function normalize(target) {
  if (typeof target !== "string" || target.length > 2048) throw fail(400, "Invalid target");
  let url;
  try {
    url = new URL(target);
  } catch {
    throw fail(400, "Invalid target");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.hostname === "" || url.username !== "" || url.password !== "")
    throw fail(400, "Invalid target");
  return url.href;
}
function handle(request, raw, send, respond) {
  const parts = new URL(request.url, "http://local").pathname.split("/").filter(Boolean);
  if (parts[0] === "links" && parts.length === 1 && request.method === "POST") {
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      throw fail(400, "Malformed JSON");
    }
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join() !== "alias,target")
      throw fail(400, "Invalid fields");
    if (typeof value.alias !== "string" || !/^[a-z0-9][a-z0-9-]{0,31}$/.test(value.alias)) throw fail(400, "Invalid alias");
    const target = normalize(value.target);
    if (links.has(value.alias)) throw fail(409, "Alias in use");
    links.set(value.alias, target);
    return send(201, { alias: value.alias, target });
  }
  if (parts[0] === "links" && parts.length === 2) {
    const alias = parts[1];
    if (!links.has(alias)) throw fail(404, "Unknown alias");
    if (request.method === "GET") return send(200, { alias, target: links.get(alias) });
    if (request.method === "DELETE") {
      links.delete(alias);
      return send(204);
    }
  }
  if (parts[0] === "r" && parts.length === 2 && request.method === "GET") {
    if (!links.has(parts[1])) throw fail(404, "Unknown alias");
    return respond(302, links.get(parts[1]));
  }
  throw fail(404, "Not found");
}
http
  .createServer(async (request, response) => {
    const send = (code, value) => {
      response.writeHead(code, { "content-type": "application/json" });
      response.end(code === 204 ? undefined : JSON.stringify(value));
    };
    const respond = (code, location) => {
      response.writeHead(code, { location });
      response.end();
    };
    try {
      handle(request, await readBody(request), send, respond);
    } catch (error) {
      send(error.status ?? 400, { error: error.message });
    }
  })
  .listen(Number(process.env.PORT), "127.0.0.1");
