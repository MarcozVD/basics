import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "../../../site/.vitepress/dist");
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".webp": "image/webp",
};
// Static files only, no API and no SPA fallback: nested routes must exist in the Pages artifact.
export async function startStaticServer(port = Number(process.env.BASICS_DEMO_TEST_PORT ?? 4860)) {
  if (!Number.isInteger(port) || port < 4830) throw new Error("Demo tests require a port at or above 4830");
  if (!fs.existsSync(path.join(root, "demo/index.html"))) throw new Error("Run npm run demo:build first");
  const server = http.createServer((request, response) => {
    try {
      const url = new URL(request.url, `http://127.0.0.1:${port}`);
      if (!url.pathname.startsWith("/basics/") || !["GET", "HEAD"].includes(request.method)) {
        response.writeHead(404).end();
        return;
      }
      let file = path.resolve(root, decodeURIComponent(url.pathname.slice("/basics/".length)));
      if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
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
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.BASICS_DEMO_TEST_PORT ?? 4860);
  await startStaticServer(port);
  console.log(`Static site: http://127.0.0.1:${port}/basics/`);
}
