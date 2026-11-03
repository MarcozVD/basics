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
import { generateLargeVault } from "./perf-vault.mjs";

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
generateLargeVault(syntheticVault, { techs: TECHS, practices: PRACTICES, layers: LAYERS, profiles: PROFILES });

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

/**
 * Distinct queries one after another: the memo of the exact same query helps a repeated call only,
 * so this is what the search box pays when the user keeps typing (the client debounces at 200 ms).
 */
async function measureDistinctSearch(vault, tag, queries) {
  const httpSamples = [];
  const mcpSamples = [];
  const http = { firstMs: 0, p50: 0, p95: 0, bytes: 0 };
  const port = await freePort();
  const server = startServer(port, vault, `${tag}-distinct`);
  try {
    await waitListening(port);
    for (const [index, query] of queries.entries()) {
      const call = await timed(async () => {
        const res = await fetch(`http://127.0.0.1:${port}/api/search?q=${encodeURIComponent(query)}`);
        const body = await res.text();
        if (!res.ok) throw new Error(`search -> ${res.status} ${body.slice(0, 200)}`);
        return body;
      });
      if (index === 0) http.firstMs = round(call.ms);
      httpSamples.push(call.ms);
      http.bytes = call.value.length;
    }
    http.p50 = stats(httpSamples).p50;
    http.p95 = stats(httpSamples).p95;
  } finally {
    stopServer(server);
  }

  const pair = await mcpPair(vault);
  const mcp = { firstMs: 0, p50: 0, p95: 0, bytes: 0 };
  try {
    for (const [index, query] of queries.entries()) {
      const call = await timed(() => pair.call("search_vault", { query }));
      const result = call.value;
      if (result.isError) throw new Error(`search_vault failed: ${(result.content?.[0]?.text ?? "").slice(0, 200)}`);
      if (index === 0) mcp.firstMs = round(call.ms);
      mcpSamples.push(call.ms);
      mcp.bytes = (result.content?.[0]?.text ?? "").length;
    }
    mcp.p50 = stats(mcpSamples).p50;
    mcp.p95 = stats(mcpSamples).p95;
  } finally {
    await pair.close();
  }
  return { http, mcp };
}

const DISTINCT_QUERIES = {
  examples: [
    "api",
    "react",
    "python",
    "test",
    "database",
    "auth",
    "cache",
    "queue",
    "search",
    "graph",
    "http",
    "json",
    "css",
    "sql",
    "docker",
    "lint",
    "deploy",
    "monitor",
    "log",
    "mail",
  ],
  synthetic600: Array.from({ length: 20 }, (_, index) => `tech ${index}`),
};

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
    process.stderr.write(`[perf] ${name}: distinct search...\n`);
    const distinctSearch = await measureDistinctSearch(dir, name, DISTINCT_QUERIES[name]);
    results.vaults[name] = { http, mcp, distinctSearch };
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

  const distinctHeader = ["vault", "distinct queries", "first ms", "p50 ms", "p95 ms", "bytes"];
  const distinctRows = [];
  for (const [vault, { distinctSearch }] of Object.entries(results.vaults)) {
    for (const [kind, entry] of Object.entries(distinctSearch)) {
      distinctRows.push([vault, kind === "http" ? "GET /api/search" : "search_vault", entry.firstMs, entry.p50, entry.p95, entry.bytes]);
    }
  }
  const distinctWidths = distinctHeader.map((cell, index) =>
    Math.max(cell.length, ...distinctRows.map((row) => String(row[index]).length)),
  );
  const distinctLine = (cells) => cells.map((cell, index) => String(cell).padEnd(distinctWidths[index])).join("  ");
  console.log(
    [distinctLine(distinctHeader), distinctLine(distinctWidths.map((width) => "-".repeat(width))), ...distinctRows.map(distinctLine)].join(
      "\n",
    ),
  );
  console.log("");
  if (outFile) {
    fs.writeFileSync(path.resolve(outFile), `${JSON.stringify(results, null, 2)}\n`);
    console.log(`json: ${path.resolve(outFile)}`);
  }
} finally {
  fs.rmSync(runDir, { recursive: true, force: true });
}
