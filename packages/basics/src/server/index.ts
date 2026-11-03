import path from "node:path";
import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { EventHub } from "./events.js";

export async function startServer(opts: {
  root: string;
  port?: number;
  host?: string;
  uiDir?: string;
}): Promise<{ url: string; close: () => Promise<void> }> {
  const host = opts.host ?? "127.0.0.1";
  const port = opts.port ?? 4747;
  const uiDir = opts.uiDir ?? path.join(import.meta.dirname, "../ui");

  const events = new EventHub(opts.root);
  events.start();
  // Wait for the first scan: the vault cache relies on the watcher for external edits, so a change
  // made after the server answers must be seen.
  await events.ready();
  const app = createApp({ root: opts.root, uiDir, events });
  const server = serve({ fetch: app.fetch, port, hostname: host });

  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  return {
    url: `http://${host}:${port}`,
    close: async () => {
      await events.close();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}
