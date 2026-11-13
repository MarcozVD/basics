import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../../site/.vitepress/dist");
const port = Number(process.env.BASICS_DEMO_TEST_PORT ?? 4860);
if (!Number.isInteger(port) || port < 4830) throw new Error("Demo tests require a port at or above 4830");
if (!fs.existsSync(path.join(root, "demo/index.html"))) throw new Error("Run npm run demo:build first");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
};
// Static files only, no API and no SPA fallback: nested routes must exist in the Pages artifact.
http
  .createServer((request, response) => {
    try {
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      if (!url.pathname.startsWith("/basics/") || !["GET", "HEAD"].includes(request.method)) {
        response.writeHead(404).end();
        return;
      }
      let file = path.resolve(root, decodeURIComponent(url.pathname.slice("/basics/".length)));
      if (!file.startsWith(`${root}${path.sep}`)) {
        response.writeHead(404).end();
        return;
      }
      if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
      response.writeHead(200, { "Content-Type": mime[path.extname(file)] ?? "application/octet-stream" });
      if (request.method === "HEAD") response.end();
      else fs.createReadStream(file).pipe(response);
    } catch {
      response.writeHead(404).end();
    }
  })
  .listen(port, "127.0.0.1", () => console.log(`Static demo: http://127.0.0.1:${port}/basics/demo/`));
