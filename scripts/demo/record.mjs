import { execFileSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { buildDemoVault, repoRoot } from "./build-vault.mjs";
import { snapshotKey } from "./key.mjs";

const output = path.resolve(process.argv[2] === "--worker" ? process.argv[3] : (process.argv[2] ?? "scripts/demo/generated/snapshot.json"));

// A worker ensures config/home are isolated before any server module is imported.
if (process.argv[2] !== "--worker") {
  const demo = buildDemoVault();
  try {
    execFileSync(process.execPath, [import.meta.filename, "--worker", output], {
      env: { ...demo.env, PATH: "", DEMO_DIRECTORY: demo.directory },
      cwd: repoRoot,
      stdio: "inherit",
      timeout: 120_000,
    });
  } finally {
    demo.cleanup();
  }
} else {
  const root = process.env.BASICS_DIR;
  if (!process.env.DEMO_DIRECTORY || root !== path.join(process.env.DEMO_DIRECTORY, "vault")) {
    throw new Error("Recorder worker requires its own generated demo vault");
  }
  const { startServer } = await import("../../packages/basics/dist/server/index.js");
  // Probe only demo ports. Do not contact or stop a service already using a port.
  async function availablePort() {
    for (let port = 4830; port < 4930; port++) {
      const free = await new Promise((resolve, reject) => {
        const probe = net.createServer();
        probe.once("error", (error) => (error.code === "EADDRINUSE" ? resolve(false) : reject(error)));
        probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
      });
      if (free) return port;
    }
    throw new Error("No free demo port in 4830-4929");
  }
  const server = await startServer({ root, port: await availablePort() });
  const snapshot = {};
  // Only machine-local display paths are normalized. Note/proposal contents and hashes stay intact.
  function portable(value) {
    if (typeof value === "string") {
      const replacements = [
        [root, "/demo-vault"],
        [process.env.HOME, "/demo-home"],
        [process.env.DEMO_DIRECTORY, "/demo-temp"],
        [repoRoot, "/demo-app"],
        [process.execPath, "node"],
        [server.url, "https://demo.invalid"],
      ];
      let result = value;
      for (const [from, to] of replacements) {
        // Snippet strings contain JSON/TOML-escaped Windows paths as well as plain paths.
        for (const spelling of [JSON.stringify(from).slice(1, -1), from, from.replaceAll("\\", "/")]) {
          result = result.replaceAll(spelling, to);
        }
      }
      return result;
    }
    if (Array.isArray(value)) return value.map(portable);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, portable(entry)]));
    return value;
  }
  async function record(method, route, body) {
    const response = await fetch(`${server.url}${route}`, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`${method} ${route}: HTTP ${response.status} ${await response.text()}`);
    const data = await response.json();
    snapshot[await snapshotKey(method, route, body)] = { status: response.status, body: portable(data) };
    return data;
  }
  try {
    const notes = await record("GET", "/api/notes");
    const layers = await record("GET", "/api/layers");
    const inbox = await record("GET", "/api/inbox");
    for (const route of [
      "/api/health",
      "/api/stats",
      "/api/config",
      "/api/packs",
      "/api/graph",
      "/api/graph?broken=1",
      "/api/embeddings",
      "/api/agents",
      "/api/connect/status",
      "/api/activity",
      "/api/activity?limit=200",
    ])
      await record("GET", route);
    for (const note of notes) await record("GET", `/api/notes/${encodeURIComponent(note.id)}`);
    for (const proposal of inbox) await record("GET", `/api/inbox/${encodeURIComponent(proposal.id)}`);
    // Explore can combine type and layer filters. Arbitrary search is derived from these notes in Stage 2.
    for (const type of [undefined, "layer", "tech", "practice", "check", "profile", "project"]) {
      for (const layer of [undefined, ...layers.map((entry) => entry.id)]) {
        const query = new URLSearchParams();
        if (type) query.set("type", type);
        if (layer) query.set("layer", layer);
        if (query.size) await record("GET", `/api/notes?${query}`);
      }
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(Object.fromEntries(Object.entries(snapshot).sort(([a], [b]) => a.localeCompare(b))))}\n`);
    console.log(
      `Recorded ${Object.keys(snapshot).length} responses, ${notes.length} notes, ${inbox.length} proposals: ${fs.statSync(output).size} bytes (${output})`,
    );
  } finally {
    await server.close();
  }
}
