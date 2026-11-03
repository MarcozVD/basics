/**
 * Server + MCP latency harness (V15-T6).
 *
 * Measures, on the built app:
 * - HTTP: `/api/graph`, `/api/notes`, `/api/search`, `/api/stats`
 * - MCP tools (in process, over an in-memory transport): `search_vault`, `recommend_stack`,
 *   `get_stack_context`, `get_vault_overview`
 *
 * "cold" is the first request of a fresh process (the CLI for HTTP, a fresh MCP server for tools),
 * repeated `--cold` times (default 3) and reported as the median: exactly what a first page load
 * or a first tool call pays. "warm" is p50/p95 over `--warm` sequential calls on the same process.
 * `bytes` is the response size, a proxy for tokens.
 *
 * Runs against two vaults: `examples/vault` and a generated one with 600 techs (the same writer
 * `packages/ui/e2e/serve.mjs` uses). It owns its servers, temp vaults, temp config and a throwaway
 * HOME/USERPROFILE/APPDATA under the OS temp folder, so nothing touches the real vault or config.
 *
 * Usage (repo root, after `npm run build`):
 *   node scripts/perf-api.mjs --label before --out perf-before.json
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

const repoRoot = path.resolve(import.meta.dirname, "..");
const cli = path.join(repoRoot, "packages", "basics", "dist", "cli.js");
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const label = flag("label", "run");
const outFile = flag("out");
const only = flag("only");
const WARM = Number.parseInt(flag("warm", "20"), 10);
const COLD = Number.parseInt(flag("cold", "3"), 10);
const TECHS = 600;
const PRACTICES = 240;
const LAYERS = 12;
const PROFILES = 8;

if (!fs.existsSync(cli)) {
  console.error(`missing ${cli}; run \`npm run build\` first`);
  process.exit(1);
}

const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-perf-api-"));
// The in-process MCP part must not read the person's real config: a config with embeddings on
// would load the model and measure that instead of the vault work. Keyword mode for both parts.
const mcpConfig = path.join(runDir, "config-mcp.json");
fs.writeFileSync(mcpConfig, JSON.stringify({ language: "en", embeddings: false }));
process.env.BASICS_CONFIG = mcpConfig;
// Point the home directory at a throwaway folder too: nothing in the harness may read or write
// the person's real agent config.
const mcpHome = path.join(runDir, "home-mcp");
const mcpAppData = path.join(mcpHome, "AppData", "Roaming");
fs.mkdirSync(mcpAppData, { recursive: true });
process.env.HOME = mcpHome;
process.env.USERPROFILE = mcpHome;
process.env.APPDATA = mcpAppData;
const exampleVault = path.join(runDir, "vault-examples");
const syntheticVault = path.join(runDir, "vault-synthetic");
fs.cpSync(path.join(repoRoot, "examples", "vault"), exampleVault, { recursive: true });
generateVault(syntheticVault);

/** 600 techs + 240 practices + 12 layers + 8 profiles, cross-linked like a real stack vault. */
function generateVault(dir) {
  const write = (folder, id, frontmatter, body) => {
    fs.mkdirSync(path.join(dir, folder), { recursive: true });
    fs.writeFileSync(path.join(dir, folder, `${id}.md`), `---\n${frontmatter}\n---\n\n${body}\n`);
  };
  for (let i = 0; i < LAYERS; i++) {
    write("layers", `layer-${i}`, `type: layer\ntitle: Layer ${i}\ndescription: Synthetic layer ${i}`, `# Layer ${i}`);
  }
  for (let i = 0; i < TECHS; i++) {
    const related = [`tech-${(i + 1) % TECHS}`, `tech-${(i + 7) % TECHS}`];
    write(
      "tech",
      `tech-${i}`,
      [
        "type: tech",
        "kind: framework",
        `title: Tech ${i}`,
        `layer: layer-${i % LAYERS}`,
        `related: [${related.join(", ")}]`,
        `practices: [practice-${i % PRACTICES}]`,
      ].join("\n"),
      `# Tech ${i}\n\nSynthetic tech for the search and token harness.`,
    );
  }
  for (let i = 0; i < PRACTICES; i++) {
    write(
      "practices",
      `practice-${i}`,
      `type: practice\ntitle: Practice ${i}\napplies_to: [tech-${(i * 5) % TECHS}]`,
      `- Synthetic practice ${i}.`,
    );
  }
  for (let i = 0; i < PROFILES; i++) {
    const stack = Array.from({ length: LAYERS }, (_, layer) => `  layer-${layer}: [tech-${(layer + i) % TECHS}]`).join("\n");
    write("profiles", `profile-${i}`, `type: profile\ntitle: Profile ${i}\nstack:\n${stack}`, `# Profile ${i}`);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/** Wait until the port accepts a connection: listening happens before any vault load. */
function waitListening(port) {
  const deadline = Date.now() + 45_000;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(port, "127.0.0.1");
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() > deadline) reject(new Error(`server on ${port} never listened`));
        else setTimeout(attempt, 100);
      });
    };
    attempt();
  });
}

function startServer(port, vault, tag) {
  const config = path.join(runDir, `config-${tag}.json`);
  fs.writeFileSync(config, JSON.stringify({ language: "en" }));
  const home = path.join(runDir, `home-${tag}`);
  const appData = path.join(home, "AppData", "Roaming");
  fs.mkdirSync(appData, { recursive: true });
  const child = spawn(process.execPath, [cli, "--vault", vault, "ui", "--no-open", "--port", String(port)], {
    stdio: "ignore",
    env: { ...process.env, BASICS_CONFIG: config, HOME: home, USERPROFILE: home, APPDATA: appData },
  });
  return { child, port };
}

function stopServer(server) {
  server?.child?.kill();
}

async function timed(fn) {
  const started = process.hrtime.bigint();
  const value = await fn();
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  return { ms, value };
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))];
  return { p50: round(at(0.5)), p95: round(at(0.95)), min: round(sorted[0]), max: round(sorted[sorted.length - 1]) };
}

const median = (samples) => stats(samples).p50;

const round = (value) => Math.round(value * 10) / 10;

/** Cold call on a fresh process, then warm calls on one shared process. */
async function measureHttp(vault, tag, requests) {
  const results = {};
  for (const [index, [name, url]] of Object.entries(requests).entries()) {
    const samples = [];
    let bytes = 0;
    for (let sample = 0; sample < COLD; sample++) {
      const port = await freePort();
      const server = startServer(port, vault, `${tag}-cold-${index}-${sample}`);
      try {
        await waitListening(port);
        const cold = await timed(async () => {
          const res = await fetch(`http://127.0.0.1:${port}${url}`);
          const body = await res.text();
          if (!res.ok) throw new Error(`${url} -> ${res.status} ${body.slice(0, 200)}`);
          return body;
        });
        samples.push(cold.ms);
        bytes = cold.value.length;
      } finally {
        stopServer(server);
      }
    }
    results[name] = {
      coldMs: median(samples),
      coldSamples: samples.map(round),
      coldBytes: bytes,
      warm: null,
    };
  }

  const port = await freePort();
  const server = startServer(port, vault, `${tag}-warm`);
  try {
    await waitListening(port);
    for (const [name, url] of Object.entries(requests)) {
      const samples = [];
      let bytes = 0;
      for (let i = 0; i < WARM; i++) {
        const call = await timed(async () => {
          const res = await fetch(`http://127.0.0.1:${port}${url}`);
          const body = await res.text();
          if (!res.ok) throw new Error(`${url} -> ${res.status} ${body.slice(0, 200)}`);
          return body;
        });
        samples.push(call.ms);
        bytes = call.value.length;
      }
      results[name].warm = { ...stats(samples), bytes };
    }
  } finally {
    stopServer(server);
  }
  return results;
}

async function mcpPair(root) {
  const { createMcpServer } = await import(pathToFileURL(path.join(repoRoot, "packages", "basics", "dist", "mcp", "tools.js")).href);
  const server = createMcpServer(() => root);
  const client = new Client({ name: "perf-harness", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    call: (name, args) => client.callTool({ name, arguments: args }),
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

async function measureMcp(vault, calls) {
  const results = {};
  for (const [name, args] of Object.entries(calls)) {
    const samples = [];
    let bytes = 0;
    for (let sample = 0; sample < COLD; sample++) {
      const pair = await mcpPair(vault);
      try {
        const cold = await timed(() => pair.call(name, args));
        const body = cold.value.content?.[0]?.text ?? "";
        if (cold.value.isError) throw new Error(`${name} failed: ${body.slice(0, 200)}`);
        samples.push(cold.ms);
        bytes = body.length;
      } finally {
        await pair.close();
      }
    }
    results[name] = { coldMs: median(samples), coldSamples: samples.map(round), coldBytes: bytes, warm: null };
  }

  const pair = await mcpPair(vault);
  try {
    for (const [name, args] of Object.entries(calls)) {
      const samples = [];
      let bytes = 0;
      for (let i = 0; i < WARM; i++) {
        const call = await timed(() => pair.call(name, args));
        samples.push(call.ms);
        bytes = (call.value.content?.[0]?.text ?? "").length;
      }
      results[name].warm = { ...stats(samples), bytes };
    }
  } finally {
    await pair.close();
  }
  return results;
}

const HTTP_REQUESTS = (searchQuery) => ({
  "GET /api/graph": "/api/graph",
  "GET /api/notes": "/api/notes",
  [`GET /api/search?q=${searchQuery}`]: `/api/search?q=${searchQuery}`,
  "GET /api/stats": "/api/stats",
});
const SEARCH_QUERIES = { examples: "api", synthetic600: "synthetic" };

const MCP_REQUESTS = {
  examples: {
    search_vault: { query: "test" },
    recommend_stack: { description: "REST API for invoices in Python with a React dashboard" },
    get_stack_context: { tech_ids: ["fastapi"] },
    get_vault_overview: {},
  },
  synthetic600: {
    search_vault: { query: "synthetic" },
    recommend_stack: { description: "REST API for invoices in Python with a React dashboard" },
    get_stack_context: { tech_ids: ["tech-1", "tech-2"] },
    get_vault_overview: {},
  },
};

const results = { label, generatedAt: new Date().toISOString(), warmCalls: WARM, vaults: {} };
try {
  const vaults = [
    ["examples", exampleVault, "examples"],
    ["synthetic600", syntheticVault, "synthetic600"],
  ];
  for (const [name, dir] of vaults) {
    if (only && only !== name) continue;
    process.stderr.write(`[perf] ${name}: http...\n`);
    const http = await measureHttp(dir, name, HTTP_REQUESTS(SEARCH_QUERIES[name]));
    process.stderr.write(`[perf] ${name}: mcp...\n`);
    const mcp = await measureMcp(dir, MCP_REQUESTS[name]);
    results.vaults[name] = { http, mcp };
  }

  const header = ["vault", "call", "cold ms", "warm p50", "warm p95", "bytes"];
  const rows = [];
  for (const [vault, { http, mcp }] of Object.entries(results.vaults)) {
    for (const [call, entry] of Object.entries({ ...http, ...mcp })) {
      rows.push([vault, call, entry.coldMs, entry.warm?.p50 ?? "-", entry.warm?.p95 ?? "-", entry.warm?.bytes ?? entry.coldBytes]);
    }
  }
  const widths = header.map((cell, index) => Math.max(cell.length, ...rows.map((row) => String(row[index]).length)));
  const line = (cells) => cells.map((cell, index) => String(cell).padEnd(widths[index])).join("  ");
  console.log(`\n# api/mcp perf (${label}, warm over ${WARM} calls)\n`);
  console.log([line(header), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join("\n"));
  console.log("");
  if (outFile) {
    fs.writeFileSync(path.resolve(outFile), `${JSON.stringify(results, null, 2)}\n`);
    console.log(`json: ${path.resolve(outFile)}`);
  }
} finally {
  fs.rmSync(runDir, { recursive: true, force: true });
}
