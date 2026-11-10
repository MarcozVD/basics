import assert from "node:assert/strict";
import fs from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFixture, EVAL_STACK, PROJECT_ID, SENTINEL, withDeterministicConfig } from "./agent-roles-fixture.mjs";

export const BASELINE_FILE = new URL("./fixtures/agent-roles-legacy.json", import.meta.url);

function normalise(value, root) {
  if (typeof value === "string") {
    // Proposal metadata is time/path dependent; never strip workflow text or other content.
    return value
      .split(root)
      .join("<fixture>")
      .split(root.replaceAll("\\", "\\\\"))
      .join("<fixture>")
      .replace(/<fixture>[^"\n]*/g, (segment) => segment.replaceAll("\\\\", "/").replaceAll("\\", "/"))
      .replace(/"(created|updated)":"[^"]+"/g, '"$1":"<timestamp>"')
      .replace(/"base_hash":"[^"]+"/g, '"base_hash":"<hash>"');
  }
  if (Array.isArray(value)) return value.map((entry) => normalise(entry, root));
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalise(entry, root)]));
  return value;
}

/** Captures legacy wire contracts on a disposable vault, optionally using source imports in unit tests. */
export async function captureContract(api, workflow) {
  return withDeterministicConfig(async () => {
    const fixture = createFixture();
    const server = api.createMcpServer(() => fixture.vault);
    const client = new Client({ name: "contract-agent", version: "1" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const cases = [
        ["get_vault_overview", {}],
        ["list_layers", {}],
        ["search_vault", { query: "React" }],
        ["get_note", { id: "react" }],
        ["recommend_stack", { description: "dashboard interactivo TypeScript React", layers: ["frontend"] }],
        ["get_stack_context", { tech_ids: EVAL_STACK, versions: { react: "19" } }],
        ["get_check_templates", { stack: EVAL_STACK }],
        ["detect_stack", { path: fixture.project }],
        [
          "propose_note",
          {
            id: "react-components",
            type: "practice",
            frontmatter: { title: "Componentes React", applies_to: ["react", "nextjs"] },
            body: "Use functional state updates for deferred increments.",
            reason: "Counter fixture evidence",
            agent: "contract-agent",
          },
        ],
        ["record_project_outcome", { project: PROJECT_ID, summary: "Checked counter", lessons: ["Keep checks reproducible."] }],
        ["export_project", { stack: EVAL_STACK, existing: { "AGENTS.md": SENTINEL, "CLAUDE.md": SENTINEL } }],
        ["list_proposals", {}],
        ["get_note", { id: "does-not-exist" }],
        ["get_stack_context", { tech_ids: ["does-not-exist"] }],
        ["export_project", { stack: ["backend"] }],
        ["propose_note", { id: "denied", type: "practice", frontmatter: {}, body: "", reason: "", agent: "pack:reserved" }],
        ["detect_stack", { path: `${fixture.root}/missing` }],
        ["get_note", {}],
      ];
      const results = [];
      for (const [name, args] of cases) {
        const input = workflow && ["get_vault_overview", "get_stack_context"].includes(name) ? { ...args, workflow } : args;
        results.push({ name, result: normalise(await client.callTool({ name, arguments: input }), fixture.root) });
      }
      // Missing-vault errors also remain byte-identical, including after an opt-in request.
      fs.renameSync(fixture.vault, `${fixture.vault}-moved`);
      results.push({
        name: "missing-vault",
        result: normalise(await client.callTool({ name: "get_note", arguments: { id: "react" } }), fixture.root),
      });
      return { tools: api.toolDefinitions(), prompts: api.promptDefinitions(), prompt: api.planStackPrompt("Counter dashboard"), results };
    } finally {
      await client.close();
      await server.close();
      fixture.cleanup();
    }
  });
}

export async function verifyLegacyContract(api) {
  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, "utf8"));
  const actual = await captureContract(api);
  const tools = structuredClone(actual.tools);
  for (const tool of tools) {
    if (["get_vault_overview", "get_stack_context"].includes(tool.name)) {
      assert.ok(tool.inputSchema.properties.workflow, `${tool.name} exposes optional declaration`);
      assert.ok(!tool.inputSchema.required?.includes("workflow"), "workflow must be optional");
      delete tool.inputSchema.properties.workflow;
    }
  }
  assert.deepEqual({ ...actual, tools }, baseline.contract, "legacy catalog, prompts and wire results must match baseline");
  for (const role of ["general", "single-agent"]) {
    const general = await captureContract(api, { version: 1, role });
    assert.deepEqual(general.results, actual.results, `${role} must preserve legacy result bytes`);
  }
  return { status: "PASS", baseline: baseline.sha, cases: actual.results.length, tools: tools.length };
}
