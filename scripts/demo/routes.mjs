import fs from "node:fs";
import path from "node:path";
import { snapshotKey } from "./key.mjs";

// GitHub Pages has no SPA rewrite. Materialize route entry files with the same absolute asset URLs.
const repo = path.resolve(import.meta.dirname, "../..");
const output = path.join(repo, "site/.vitepress/dist/demo");
const html = fs.readFileSync(path.join(output, "index.html"));
const snapshot = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "generated/snapshot.json"), "utf8"));
const notes = snapshot[await snapshotKey("GET", "/api/notes")].body;
const inbox = snapshot[await snapshotKey("GET", "/api/inbox")].body;
const routes = [
  "explore",
  "graph",
  "inbox",
  "recommend",
  "projects",
  "settings",
  "skills",
  ...notes.map((note) => `notes/${note.id}`),
  ...inbox.map((proposal) => `inbox/${proposal.id}`),
];
for (const route of routes) {
  const directory = path.resolve(output, route);
  if (!directory.startsWith(`${output}${path.sep}`)) throw new Error(`Unsafe demo route: ${route}`);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "index.html"), html);
}
console.log(`Wrote ${routes.length} static demo route entries.`);
