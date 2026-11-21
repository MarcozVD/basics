import http from "node:http";

const tasks = new Map();
let next = 1;
function validate(body, creating) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !["title", "status"].includes(key)) ||
    !Object.keys(body).length
  )
    throw new Error("Invalid fields");
  if (creating && !Object.hasOwn(body, "title")) throw new Error("Title required");
  if (Object.hasOwn(body, "title") && (typeof body.title !== "string" || !body.title.trim() || body.title.trim().length > 120))
    throw new Error("Invalid title");
  if (Object.hasOwn(body, "status") && !["todo", "done"].includes(body.status)) throw new Error("Invalid status");
  return {
    ...(Object.hasOwn(body, "title") ? { title: body.title.trim() } : {}),
    ...(Object.hasOwn(body, "status") ? { status: body.status } : {}),
  };
}
http
  .createServer(async (request, response) => {
    const send = (code, value) => {
      response.writeHead(code, { "content-type": "application/json" });
      response.end(code === 204 ? undefined : JSON.stringify(value));
    };
    try {
      const url = new URL(request.url, "http://local"),
        id = url.pathname.match(/^\/tasks\/([^/]+)$/)?.[1];
      if (request.method === "GET" && url.pathname === "/tasks") {
        const status = url.searchParams.get("status"),
          offset = Number(url.searchParams.get("offset") ?? 0),
          limit = Number(url.searchParams.get("limit") ?? 20);
        if (
          (status !== null && !["todo", "done"].includes(status)) ||
          !Number.isInteger(offset) ||
          offset < 0 ||
          !Number.isInteger(limit) ||
          limit < 1 ||
          limit > 100
        )
          return send(400, { error: "Invalid query" });
        const items = [...tasks.values()].filter((task) => status === null || task.status === status);
        return send(200, { items: items.slice(offset, offset + limit), total: items.length });
      }
      if (id) {
        if (!tasks.has(id)) return send(404, { error: "Missing task" });
        if (request.method === "GET") return send(200, tasks.get(id));
        if (request.method === "DELETE") {
          tasks.delete(id);
          return send(204);
        }
      }
      if ((request.method === "POST" && url.pathname === "/tasks") || (request.method === "PATCH" && id)) {
        let raw = "";
        for await (const chunk of request) {
          raw += chunk;
          if (raw.length > 65536) throw new Error("Body too large");
        }
        const data = validate(JSON.parse(raw), request.method === "POST");
        const task = request.method === "POST" ? { id: String(next++), status: "todo", ...data } : { ...tasks.get(id), ...data };
        tasks.set(task.id, task);
        return send(request.method === "POST" ? 201 : 200, task);
      }
      send(404, { error: "Not found" });
    } catch (error) {
      send(400, { error: error.message });
    }
  })
  .listen(Number(process.env.PORT), "127.0.0.1");
