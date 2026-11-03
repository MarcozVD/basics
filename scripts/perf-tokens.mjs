/**
 * MCP response size harness (V15-T6 stage 2).
 *
 * Measure, don't guess: for a fixed set of tool calls on two vaults, report how many bytes and
 * tokens each response costs. Tokens are estimated as characters / 4, the same proxy the task file
 * names; the exact number depends on the client's tokenizer, the ratio between calls is what
 * matters. The `plan-stack` prompt is measured the same way, since it is billed on every agent run.
 *
 * Runs on the built app with temp vaults, a temp config and a throwaway HOME/USERPROFILE/APPDATA,
 * so nothing touches the real vault, config or agent folders. Keyword ranking only (embeddings off).
 *
 * Usage (repo root, after `npm run build`):
 *   node scripts/perf-tokens.mjs --label before --out tokens-before.json
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { generateLargeVault } from "./perf-vault.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const dist = (...parts) => pathToFileURL(path.join(repoRoot, "packages", ...parts)).href;
const argv = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? fallback : argv[index + 1];
};
const label = flag("label", "run");
const outFile = flag("out");

const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-tokens-"));
const config = path.join(runDir, "config.json");
fs.writeFileSync(config, JSON.stringify({ language: "en", embeddings: false }));
process.env.BASICS_CONFIG = config;
const home = path.join(runDir, "home");
const appData = path.join(home, "AppData", "Roaming");
fs.mkdirSync(appData, { recursive: true });
process.env.HOME = home;
process.env.USERPROFILE = home;
process.env.APPDATA = appData;

const exampleVault = path.join(runDir, "vault-examples");
fs.cpSync(path.join(repoRoot, "examples", "vault"), exampleVault, { recursive: true });
const syntheticVault = path.join(runDir, "vault-synthetic");
generateLargeVault(syntheticVault);

const PROJECT = "A booking app for small clinics: staff schedules, patient reminders and invoices.";
const CALLS = {
  examples: [
    ["get_vault_overview", {}],
    ["list_layers", {}],
    ["search_vault", { query: "api" }],
    ["get_note", { id: "fastapi" }],
    ["recommend_stack", { description: PROJECT }],
    ["get_stack_context", { tech_ids: ["fastapi", "react"] }],
    ["get_check_templates", { stack: ["fastapi"] }],
    ["list_proposals", {}],
  ],
  synthetic600: [
    ["get_vault_overview", {}],
    ["list_layers", {}],
    ["search_vault", { query: "synthetic" }],
    ["get_note", { id: "tech-1" }],
    ["recommend_stack", { description: PROJECT }],
    ["get_stack_context", { tech_ids: ["tech-1", "tech-2"] }],
    ["get_check_templates", { stack: ["tech-1"] }],
    ["list_proposals", {}],
  ],
};

const tokens = (chars) => Math.round(chars / 4);

async function mcpPair(root) {
  const { createMcpServer } = await import(dist("basics", "dist", "mcp", "tools.js"));
  const server = createMcpServer(() => root);
  const client = new Client({ name: "tokens-harness", version: "0.0.0" });
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

const results = { label, generatedAt: new Date().toISOString(), vaults: {}, prompt: {} };
try {
  for (const [vaultName, root] of [
    ["examples", exampleVault],
    ["synthetic600", syntheticVault],
  ]) {
    const pair = await mcpPair(root);
    const calls = {};
    try {
      for (const [name, args] of CALLS[vaultName]) {
        const result = await pair.call(name, args);
        const body = result.content?.[0]?.text ?? "";
        if (result.isError) throw new Error(`${name} failed: ${body.slice(0, 200)}`);
        calls[name] = { chars: body.length, tokens: tokens(body.length), lines: body.split("\n").length };
      }
    } finally {
      await pair.close();
    }
    results.vaults[vaultName] = calls;
  }

  const { planStackPrompt } = await import(dist("basics", "dist", "mcp", "tools.js"));
  const { AGENT_DECISION_SUFFIX } = await import(dist("basics", "dist", "agents.js"));
  const prompt = planStackPrompt(PROJECT);
  const runPrompt = `${prompt}${AGENT_DECISION_SUFFIX}`;
  results.prompt = {
    "plan-stack": { chars: prompt.length, tokens: tokens(prompt.length) },
    "plan-stack + agent suffix": { chars: runPrompt.length, tokens: tokens(runPrompt.length) },
  };

  const header = ["vault", "call", "chars", "tokens (chars/4)", "lines"];
  const rows = [];
  for (const [vault, calls] of Object.entries(results.vaults)) {
    for (const [call, entry] of Object.entries(calls)) rows.push([vault, call, entry.chars, entry.tokens, entry.lines]);
  }
  for (const [call, entry] of Object.entries(results.prompt)) rows.push(["prompt", call, entry.chars, entry.tokens, "-"]);
  const widths = header.map((cell, index) => Math.max(cell.length, ...rows.map((row) => String(row[index]).length)));
  const line = (cells) => cells.map((cell, index) => String(cell).padEnd(widths[index])).join("  ");
  console.log(`\n# mcp response size (${label}, tokens = chars / 4)\n`);
  console.log([line(header), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join("\n"));
  console.log("");
  if (outFile) {
    fs.writeFileSync(path.resolve(outFile), `${JSON.stringify(results, null, 2)}\n`);
    console.log(`json: ${path.resolve(outFile)}`);
  }
} finally {
  fs.rmSync(runDir, { recursive: true, force: true });
}
