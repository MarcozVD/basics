import fs from "node:fs";

const RANK = { static: 0, param: 1, wildcard: 2 };
function compile(route) {
  if (!route || typeof route.name !== "string" || route.name === "" || typeof route.pattern !== "string") throw new Error("Invalid route");
  const pattern = route.pattern;
  if (!pattern.startsWith("/")) throw new Error("Pattern must start with /");
  if (pattern === "/") return { name: route.name, segments: [] };
  if (pattern.endsWith("/")) throw new Error("Trailing slash in pattern");
  const parts = pattern.slice(1).split("/"),
    names = new Set();
  const segments = parts.map((part, index) => {
    if (part === "") throw new Error("Empty segment");
    if (part === "*") {
      if (index !== parts.length - 1) throw new Error("Wildcard must be last");
      return { kind: "wildcard" };
    }
    if (part.startsWith(":")) {
      const name = part.slice(1);
      if (!/^[a-z][a-z0-9_]*$/.test(name) || names.has(name)) throw new Error("Invalid parameter name");
      names.add(name);
      return { kind: "param", name };
    }
    return { kind: "static", text: part.startsWith("\\") ? part.slice(1) : part };
  });
  return { name: route.name, segments };
}
function decode(segment) {
  return decodeURIComponent(segment);
}
function match(route, parts) {
  const params = {};
  const { segments } = route;
  const last = segments.at(-1);
  if (last?.kind === "wildcard") {
    if (parts.length < segments.length) return null;
  } else if (parts.length !== segments.length) return null;
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    if (segment.kind === "wildcard") params["*"] = parts.slice(i).join("/");
    else if (segment.kind === "param") params[segment.name] = parts[i];
    else if (segment.text !== parts[i]) return null;
  }
  return params;
}
const better = (a, b) => {
  const length = Math.max(a.segments.length, b.segments.length);
  for (let i = 0; i < length; i++) {
    const x = a.segments[i] ? RANK[a.segments[i].kind] : 3,
      y = b.segments[i] ? RANK[b.segments[i].kind] : 3;
    if (x !== y) return x < y;
  }
  return false;
};
try {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!input || !Array.isArray(input.routes) || !Array.isArray(input.requests) || input.requests.some((value) => typeof value !== "string"))
    throw new Error("Invalid input");
  const routes = input.routes.map(compile);
  if (new Set(routes.map((route) => route.name)).size !== routes.length) throw new Error("Duplicate route names");
  const results = input.requests.map((request) => {
    let path = request.split("?")[0];
    if (!path.startsWith("/")) return { error: "bad_request" };
    if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
    const raw = path === "/" ? [] : path.slice(1).split("/");
    if (raw.some((part) => part === "")) return { error: "bad_request" };
    let parts;
    try {
      parts = raw.map(decode);
    } catch {
      return { error: "bad_request" };
    }
    let best = null;
    for (const route of routes) {
      const params = match(route, parts);
      if (params && (!best || better(route, best.route))) best = { route, params };
    }
    return best ? { route: best.route.name, params: best.params } : { route: null, params: {} };
  });
  console.log(JSON.stringify({ results }));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
