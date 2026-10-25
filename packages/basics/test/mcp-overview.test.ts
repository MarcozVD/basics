import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readActivity, Vault } from "@marcozvd/basics-core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { test } from "vitest";
import { createMcpServer } from "../src/mcp/tools.js";

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");

function tempVault(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-mcp-overview-"));
  fs.cpSync(SEED, dir, { recursive: true });
  return dir;
}

async function withClient(root: string, fn: (client: Client) => Promise<void>): Promise<void> {
  const server = createMcpServer(() => root);
  const client = new Client({ name: "test-agent", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    await fn(client);
  } finally {
    await client.close();
    await server.close();
  }
}

function firstText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const [first] = result.content as { type: string; text: string }[];
  return first.text;
}

test("get_vault_overview catalogs layers, techs, profiles and projects", async () => {
  const root = tempVault();
  const vault = Vault.load(root);
  vault.writeNote(
    "dashboard",
    {
      type: "project",
      title: "Dashboard",
      status: "active",
      stack: { frontend: ["react"], backend: ["fastapi"] },
      lessons: ["one", "two", "three", "four", "five"],
      tags: [],
      source: "manual",
    },
    "# Dashboard",
  );
  vault.writeNote("old-thing", { type: "project", title: "Old thing", status: "archived", stack: {}, tags: [], source: "manual" }, "# Old");

  await withClient(root, async (client) => {
    const result = await client.callTool({ name: "get_vault_overview", arguments: {} });
    assert.ok(!result.isError);
    const overview = JSON.parse(firstText(result)) as {
      layers: { id: string; title: string; techs: Record<string, unknown>[] }[];
      profiles: { id: string; title: string; use_when: string[]; stack: Record<string, string[]> }[];
      projects: { id: string; status: string; stack: Record<string, string[]>; lessons?: string[] }[];
      truncated?: boolean;
    };

    assert.equal(overview.layers.length, 5);
    const backend = overview.layers.find((layer) => layer.id === "backend");
    assert.ok(backend?.title);
    const fastapi = backend.techs.find((tech) => tech.id === "fastapi");
    assert.ok(fastapi);
    assert.equal(fastapi.kind, "framework");
    assert.equal(fastapi.language, "python");
    assert.ok(Array.isArray(fastapi.use_when) && fastapi.use_when.length > 0);
    assert.ok(Array.isArray(fastapi.avoid_when) && fastapi.avoid_when.length > 0);
    assert.ok(Array.isArray(fastapi.performs_best) && fastapi.performs_best.length > 0);
    assert.equal(fastapi.version, undefined);
    assert.equal(overview.truncated, undefined);

    assert.equal(overview.profiles.length, 2);
    const saas = overview.profiles.find((profile) => profile.id === "saas-web");
    assert.ok(saas?.use_when.length);
    assert.ok(saas.stack.frontend.includes("react"));

    assert.deepEqual(
      overview.projects.map((project) => project.id),
      ["dashboard"],
    );
    assert.deepEqual(overview.projects[0].lessons, ["three", "four", "five"]);
    assert.ok(overview.projects[0].stack.backend.includes("fastapi"));

    const filtered = await client.callTool({ name: "get_vault_overview", arguments: { layers: ["backend"] } });
    const partial = JSON.parse(firstText(filtered)) as { layers: { id: string }[] };
    assert.deepEqual(
      partial.layers.map((layer) => layer.id),
      ["backend"],
    );

    const events = readActivity(root).filter((event) => event.tool === "get_vault_overview");
    assert.equal(events.length, 2);
    assert.equal(events[0].agent, "test-agent");
  });
});

test("get_vault_overview truncates a catalog over the size budget", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-mcp-overview-big-"));
  fs.mkdirSync(path.join(root, "layers"));
  fs.mkdirSync(path.join(root, "tech"));
  fs.writeFileSync(path.join(root, "layers", "backend.md"), "---\ntype: layer\ntitle: Backend\n---\n# Backend\n");
  const phrase = "word ".repeat(20).trim();
  const list = (label: string, i: number) => Array.from({ length: 20 }, (_, j) => `  - ${label} ${i}-${j} ${phrase}`).join("\n");
  for (let i = 0; i < 40; i++) {
    fs.writeFileSync(
      path.join(root, "tech", `tech-${i}.md`),
      `---\ntype: tech\nkind: library\ntitle: Tech ${i}\nlayer: backend\nuse_when:\n${list("use", i)}\navoid_when:\n${list("avoid", i)}\nperforms_best:\n${list("best", i)}\n---\n# Tech ${i}\n`,
    );
  }

  await withClient(root, async (client) => {
    const result = await client.callTool({ name: "get_vault_overview", arguments: {} });
    assert.ok(!result.isError);
    const body = firstText(result);
    const overview = JSON.parse(body) as {
      layers: { techs: Record<string, unknown>[] }[];
      truncated?: boolean;
    };

    assert.equal(overview.truncated, true);
    assert.ok(body.length <= 60 * 1024);
    const tech = overview.layers[0].techs[0];
    assert.equal((tech.use_when as string[]).length, 3);
    assert.equal((tech.avoid_when as string[]).length, 3);
    assert.equal(tech.performs_best, undefined);
  });
});

test("plan-stack prompt is listed and renders the project text", async () => {
  const root = tempVault();
  await withClient(root, async (client) => {
    const listed = await client.listPrompts();
    const prompt = listed.prompts.find((entry) => entry.name === "plan-stack");
    assert.ok(prompt);
    assert.equal(prompt.arguments?.length, 1);
    assert.equal(prompt.arguments?.[0].name, "project");
    assert.equal(prompt.arguments?.[0].required, true);

    // $& and $1 must survive verbatim: the project text is not a replacement pattern.
    const project = "REST API for invoices with $& and $1 in the copy";
    const rendered = await client.getPrompt({ name: "plan-stack", arguments: { project } });
    const [message] = rendered.messages;
    assert.equal(message.role, "user");
    assert.equal(message.content.type, "text");
    const text = (message.content as { type: "text"; text: string }).text;
    assert.ok(text.includes(project));
    assert.match(text, /get_vault_overview/);
    assert.match(text, /recommend_stack/);
    assert.match(text, /get_note/);
    assert.match(text, /¿Usamos este stack\? \/ Shall we use this stack\?/);

    // Gaps: the decision may need notes the vault is missing; propose them, do not invent them silently.
    assert.match(text, /search_vault/);
    assert.match(text, /propose_note/);
    assert.match(text, /missing note/);
    assert.match(text, /never propose more than the notes the decision actually uses/i);
    assert.match(text, /at least 2 `use_when`, at least 1 `avoid_when`/);
    assert.match(text, /3–6 lines/);
    assert.match(text, /reason/);
    assert.match(text, /Propuestas al Inbox/);
    assert.match(text, /nothing is applied until the user approves it/i);
  });
});

test("get_vault_overview never exceeds the size budget on a 600-tech vault", { timeout: 30_000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-mcp-overview-huge-"));
  fs.mkdirSync(path.join(root, "layers"));
  fs.mkdirSync(path.join(root, "tech"));
  const layers = ["backend", "frontend"];
  for (const layer of layers) {
    fs.writeFileSync(path.join(root, "layers", `${layer}.md`), `---\ntype: layer\ntitle: ${layer}\n---\n# ${layer}\n`);
  }
  const phrase = "a long reason that an agent may need to read ".repeat(2).trim();
  const list = (label: string, i: number) => Array.from({ length: 5 }, (_, j) => `  - ${label} ${i}-${j} ${phrase}`).join("\n");
  for (let i = 0; i < 600; i++) {
    const layer = layers[i % layers.length];
    fs.writeFileSync(
      path.join(root, "tech", `tech-${i}.md`),
      `---\ntype: tech\nkind: library\ntitle: Tech ${i}\nlayer: ${layer}\nuse_when:\n${list("use", i)}\navoid_when:\n${list("avoid", i)}\nperforms_best:\n${list("best", i)}\n---\n# Tech ${i}\n`,
    );
  }

  await withClient(root, async (client) => {
    const result = await client.callTool({ name: "get_vault_overview", arguments: {} });
    assert.ok(!result.isError);
    const body = firstText(result);
    assert.ok(body.length <= 60 * 1024, `overview is ${body.length} chars`);
    const overview = JSON.parse(body) as {
      layers: { techs: { id: string }[]; omitted?: string[] }[];
      truncated?: boolean;
    };
    assert.equal(overview.truncated, true);
    const omitted = overview.layers.flatMap((layer) => layer.omitted ?? []);
    const remaining = overview.layers.flatMap((layer) => layer.techs.map((tech) => tech.id));
    assert.ok(omitted.length > 0);
    assert.equal(omitted.length + remaining.length, 600);
  });
});
