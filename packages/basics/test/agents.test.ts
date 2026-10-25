import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentRunDoneEvent, AgentRunEvent } from "@marcozvd/basics-core";
import { test } from "vitest";
import {
  AGENT_DECISION_SUFFIX,
  AgentBusyError,
  AgentRunner,
  AgentUnavailableError,
  agentArgs,
  listAgents,
  resetAgentCache,
} from "../src/agents.js";
import { createApp } from "../src/server/app.js";
import type { EventHub } from "../src/server/events.js";

const HOST = { host: "localhost:4747" };
const TOOLS = [
  "mcp__basics__get_vault_overview",
  "mcp__basics__recommend_stack",
  "mcp__basics__get_note",
  "mcp__basics__search_vault",
  "mcp__basics__list_layers",
  "mcp__basics__propose_note",
];

/** A fake agent CLI: a node script driven by FAKE_AGENT_MODE, plus a `.cmd` shim on Windows. */
const FAKE_AGENT = [
  'const fs = require("node:fs");',
  "const args = process.argv.slice(2);",
  'const mode = process.env.FAKE_AGENT_MODE || "text";',
  "if (process.env.FAKE_AGENT_COUNT) fs.appendFileSync(process.env.FAKE_AGENT_COUNT, 'x');",
  "if (process.env.FAKE_AGENT_LOG) {",
  "  fs.writeFileSync(process.env.FAKE_AGENT_LOG, JSON.stringify({ args: args, cwd: process.cwd(), nodeOptions: process.env.NODE_OPTIONS || null }, null, 2));",
  "}",
  'if (args[0] === "models") {',
  '  if (mode === "models-fail") { process.stderr.write("no models\\n"); process.exit(1); }',
  '  process.stdout.write("vendor/alpha\\nvendor/beta\\nnot-a-model\\n");',
  "  process.exit(0);",
  "}",
  'if (mode === "sleep") { setInterval(function () {}, 1000); }',
  'else if (mode === "fail") { process.stderr.write("boom: unauthorized\\nsecond line\\n"); process.exit(3); }',
  'else if (mode === "claude") {',
  '  process.stdout.write(JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "Vamos a usar: backend: fastapi [[fastapi]]" }] } }) + "\\n");',
  '  process.stdout.write(JSON.stringify({ type: "result", subtype: "success", result: "FINAL DECISION" }) + "\\n");',
  "}",
  'else if (mode === "opencode") { process.stdout.write(JSON.stringify({ type: "text", part: { type: "text", text: "OPENCODE TEXT" } }) + "\\n"); }',
  'else { process.stdout.write("PLAIN OUTPUT\\n"); }',
].join("\n");

interface FakeBin {
  dir: string;
  exe: (name: string) => string;
}

function fakeBins(): FakeBin {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-fake-agents-"));
  const exe = (name: string): string => {
    const script = path.join(dir, `${name}-fake.cjs`);
    fs.writeFileSync(script, FAKE_AGENT);
    if (process.platform !== "win32") {
      const file = path.join(dir, name);
      fs.writeFileSync(file, `#!/bin/sh\nexec node "$(dirname "$0")/${name}-fake.cjs" "$@"\n`);
      fs.chmodSync(file, 0o755);
      return file;
    }
    const cmd = path.join(dir, `${name}.cmd`);
    fs.writeFileSync(cmd, `@ECHO off\r\n"%~dp0\\node.exe" "%~dp0\\${name}-fake.cjs" %*\r\n`);
    return cmd;
  };
  return { dir, exe };
}

/** Put only `dir` on PATH and point every fake agent at it, restoring the process env after. */
async function withFakePath<T>(dir: string, fn: () => Promise<T> | T, env: NodeJS.ProcessEnv = {}): Promise<T> {
  const savedPath = process.env.PATH;
  const savedEnv = new Map<string, string | undefined>();
  const next = { FAKE_AGENT_LOG: undefined, FAKE_AGENT_COUNT: undefined, FAKE_AGENT_MODE: undefined, ...env };
  for (const key of Object.keys(next)) {
    savedEnv.set(key, process.env[key]);
    if (next[key] === undefined) delete process.env[key];
    else process.env[key] = next[key];
  }
  process.env.PATH = dir;
  resetAgentCache();
  try {
    return await fn();
  } finally {
    if (savedPath === undefined) delete process.env.PATH;
    else process.env.PATH = savedPath;
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    resetAgentCache();
  }
}

interface CollectedRun {
  chunks: string[];
  done: Promise<{ ok: boolean; text: string; error?: string }>;
}

function collect(runner: AgentRunner, opts: { agent: "claude" | "opencode" | "codex"; prompt: string; model?: string }): CollectedRun {
  const chunks: string[] = [];
  const done = new Promise<{ ok: boolean; text: string; error?: string }>((resolve) => {
    runner.start(opts, { onChunk: (_id, chunk) => chunks.push(chunk), onDone: (_id, result) => resolve(result) });
  });
  return { chunks, done };
}

test("agentArgs builds the verified flag shapes as an args array", () => {
  const claude = agentArgs("claude", "PROMPT", "opus");
  assert.deepEqual(claude, {
    args: ["-p", "PROMPT", "--model", "opus", "--output-format", "stream-json", "--verbose", "--allowedTools", ...TOOLS],
    format: "stream-json",
  });
  assert.deepEqual(agentArgs("claude", "PROMPT", "default").args.slice(0, 2), ["-p", "PROMPT"]);
  assert.ok(!agentArgs("claude", "PROMPT", "default").args.includes("--model"));

  assert.deepEqual(agentArgs("opencode", "PROMPT", "vendor/alpha#v1"), {
    args: ["run", "PROMPT", "-m", "vendor/alpha#v1", "--format", "json"],
    format: "json",
  });
  assert.deepEqual(agentArgs("codex", "PROMPT", "gpt-5.1"), {
    args: ["exec", "PROMPT", "-m", "gpt-5.1", "--skip-git-repo-check", "--sandbox", "read-only"],
    format: "text",
  });
});

test("GET /api/agents lists detected CLIs, their models and registration state", async () => {
  const bin = fakeBins();
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "basics-agents-home-"));
  bin.exe("claude");
  bin.exe("opencode");
  bin.exe("codex");
  fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ mcpServers: { basics: { command: "node" } } }));
  fs.mkdirSync(path.join(home, ".config", "opencode"), { recursive: true });
  fs.writeFileSync(path.join(home, ".config", "opencode", "opencode.json"), "{ not json");
  fs.mkdirSync(path.join(home, ".codex"), { recursive: true });
  fs.writeFileSync(path.join(home, ".codex", "config.toml"), 'model = "gpt-5.1"\n\n[mcp_servers.basics]\ncommand = "node"\n');

  await withFakePath(bin.dir, async () => {
    const agents = listAgents({ home });
    const claude = agents.find((agent) => agent.id === "claude");
    assert.equal(claude?.detected, true);
    assert.deepEqual(claude?.models, ["default", "sonnet", "opus", "haiku"]);
    assert.equal(claude?.connected, true);

    const opencode = agents.find((agent) => agent.id === "opencode");
    assert.deepEqual(opencode?.models, ["vendor/alpha", "vendor/beta"]);
    assert.equal(opencode?.connected, "unknown");

    const codex = agents.find((agent) => agent.id === "codex");
    assert.deepEqual(codex?.models, ["gpt-5.1"]);
    assert.equal(codex?.connected, true);

    // An agent whose config does not exist is simply not registered.
    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "basics-agents-none-"));
    const none = listAgents({ home: bare }).find((agent) => agent.id === "claude");
    assert.equal(none?.connected, false);

    // The API returns the same shape.
    const app = createApp({ root: bare });
    const res = await app.request("/api/agents", { headers: HOST });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { agents: { id: string; detected: boolean }[] };
    assert.deepEqual(
      body.agents.map((agent) => agent.id),
      ["claude", "opencode", "codex"],
    );
    assert.ok(body.agents.every((agent) => agent.detected));
  });
});

test("opencode models are cached for 10 minutes and fall back to none when the command fails", async () => {
  const bin = fakeBins();
  bin.exe("opencode");
  const count = path.join(bin.dir, "count.txt");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "basics-agents-cache-"));

  await withFakePath(
    bin.dir,
    async () => {
      assert.deepEqual(listAgents({ home, now: 1_000 }).find((agent) => agent.id === "opencode")?.models, ["vendor/alpha", "vendor/beta"]);
      listAgents({ home, now: 2_000 });
      assert.equal(fs.readFileSync(count, "utf8"), "x");
      listAgents({ home, now: 11 * 60 * 1000 });
      assert.equal(fs.readFileSync(count, "utf8"), "xx");
    },
    { FAKE_AGENT_COUNT: count },
  );

  // A failing `opencode models` yields no models, so the UI offers free text only.
  await withFakePath(
    bin.dir,
    async () => {
      assert.deepEqual(listAgents({ home }).find((agent) => agent.id === "opencode")?.models, []);
    },
    { FAKE_AGENT_MODE: "models-fail" },
  );
});

test("a run streams output, uses a fresh empty cwd and passes the prompt as one argument", async () => {
  const bin = fakeBins();
  bin.exe("claude");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "basics-agents-root-"));
  const log = path.join(tempRoot, "invocation.json");
  const description = "REST API for invoices $(touch hacked) && echo pwned";

  await withFakePath(
    bin.dir,
    async () => {
      const runner = new AgentRunner({ tempRoot });
      const run = collect(runner, { agent: "claude", model: "opus", prompt: `plan: ${description}` });
      const result = await run.done;

      assert.equal(result.ok, true);
      assert.equal(result.text, "FINAL DECISION");
      assert.ok(run.chunks.join("").includes("Vamos a usar"));

      const invocation = JSON.parse(fs.readFileSync(log, "utf8")) as { args: string[]; cwd: string };
      assert.equal(invocation.args[0], "-p");
      assert.equal(invocation.args[1], `plan: ${description}`);
      assert.deepEqual(invocation.args.slice(2), [
        "--model",
        "opus",
        "--output-format",
        "stream-json",
        "--verbose",
        "--allowedTools",
        ...TOOLS,
      ]);
      // No shell on Windows or POSIX: the metacharacters stay inside the single argument.
      assert.ok(!fs.existsSync(path.join(tempRoot, "hacked")));
      assert.notEqual(invocation.cwd, tempRoot);
      assert.equal(path.dirname(invocation.cwd), tempRoot);
      assert.equal(fs.existsSync(invocation.cwd), false, "the run directory is removed when the run ends");
    },
    { FAKE_AGENT_MODE: "claude", FAKE_AGENT_LOG: log },
  );
});

test("opencode and codex output formats produce the final text", async () => {
  const bin = fakeBins();
  bin.exe("opencode");
  bin.exe("codex");
  await withFakePath(
    bin.dir,
    async () => {
      const opencode = collect(new AgentRunner(), { agent: "opencode", prompt: "plan" });
      assert.equal((await opencode.done).text, "OPENCODE TEXT");
      assert.ok(opencode.chunks.join("").includes("OPENCODE TEXT"));
    },
    { FAKE_AGENT_MODE: "opencode" },
  );

  await withFakePath(
    bin.dir,
    async () => {
      const codex = collect(new AgentRunner(), { agent: "codex", prompt: "plan" });
      const result = await codex.done;
      assert.equal(result.ok, true);
      assert.match(result.text, /PLAIN OUTPUT/);
    },
    { FAKE_AGENT_MODE: "text" },
  );
});

test("a non-zero exit reports the last lines of output", async () => {
  const bin = fakeBins();
  bin.exe("claude");
  await withFakePath(
    bin.dir,
    async () => {
      const run = await collect(new AgentRunner(), { agent: "claude", prompt: "plan" }).done;
      assert.equal(run.ok, false);
      assert.match(run.error ?? "", /exited with code 3/);
      assert.match(run.error ?? "", /unauthorized/);
    },
    { FAKE_AGENT_MODE: "fail" },
  );
});

test("a run is killed on timeout and on cancel", async () => {
  const bin = fakeBins();
  bin.exe("claude");
  await withFakePath(
    bin.dir,
    async () => {
      const timedOut = await collect(new AgentRunner({ timeoutMs: 300 }), { agent: "claude", prompt: "plan" }).done;
      assert.equal(timedOut.ok, false);
      assert.match(timedOut.error ?? "", /timed out/);

      const runner = new AgentRunner();
      const chunks: string[] = [];
      let resolveDone!: (result: { ok: boolean; error?: string }) => void;
      const done = new Promise<{ ok: boolean; error?: string }>((resolve) => {
        resolveDone = resolve;
      });
      const runId = runner.start(
        { agent: "claude", prompt: "plan" },
        { onChunk: () => chunks.push("x"), onDone: (_id, result) => resolveDone(result) },
      );
      assert.equal(runner.activeId, runId);
      assert.equal(runner.cancel(runId), true);
      assert.equal((await done).error, "cancelled");
      assert.equal(runner.cancel(runId), false);
      assert.equal(runner.activeId, undefined);
    },
    { FAKE_AGENT_MODE: "sleep" },
  );
});

test("a second run while one is active is rejected", async () => {
  const bin = fakeBins();
  bin.exe("claude");
  await withFakePath(
    bin.dir,
    async () => {
      const runner = new AgentRunner();
      const first = collect(runner, { agent: "claude", prompt: "one" });
      assert.throws(() => runner.start({ agent: "claude", prompt: "two" }, { onChunk: () => {}, onDone: () => {} }), AgentBusyError);
      runner.cancel(runner.activeId ?? "");
      assert.equal((await first.done).error, "cancelled");
    },
    { FAKE_AGENT_MODE: "sleep" },
  );
});

test("a missing CLI is reported as unavailable", () => {
  const runner = new AgentRunner({ resolveExe: () => undefined });
  assert.throws(() => runner.start({ agent: "codex", prompt: "plan" }, { onChunk: () => {}, onDone: () => {} }), AgentUnavailableError);
});

test("POST /api/agents/run streams over SSE, rejects a second run and keeps the guard", async () => {
  const bin = fakeBins();
  bin.exe("claude");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-agents-vault-"));
  const published: (AgentRunEvent | AgentRunDoneEvent)[] = [];
  const subscribers = new Set<(event: unknown) => void>();
  const events = {
    publish: (event: AgentRunEvent | AgentRunDoneEvent) => {
      published.push(event);
      for (const fn of subscribers) fn(event);
    },
    subscribe: (fn: (event: unknown) => void) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  } as unknown as EventHub;
  const waitForDone = (): Promise<AgentRunDoneEvent> =>
    new Promise((resolve) => {
      const found = published.find((event): event is AgentRunDoneEvent => event.type === "agent-run-done");
      if (found) return resolve(found);
      const unsubscribe = events.subscribe((event) => {
        if ((event as AgentRunDoneEvent).type === "agent-run-done") {
          unsubscribe();
          resolve(event as AgentRunDoneEvent);
        }
      });
    });

  await withFakePath(
    bin.dir,
    async () => {
      const app = createApp({ root, events });
      const res = await app.request("/api/agents/run", {
        method: "POST",
        headers: { ...HOST, "content-type": "application/json" },
        body: JSON.stringify({ agent: "claude", model: "sonnet", description: "REST API in Python", layers: ["backend"] }),
      });
      assert.equal(res.status, 202);
      const { runId } = (await res.json()) as { runId: string };
      assert.ok(runId);

      const done = await waitForDone();
      assert.equal(done.runId, runId);
      assert.equal(done.ok, true);
      assert.equal(done.text, "FINAL DECISION");
      const chunks = published.filter((event): event is AgentRunEvent => event.type === "agent-run");
      assert.ok(chunks.length > 0);
      assert.ok(chunks.every((chunk) => chunk.runId === runId));
      assert.ok(
        chunks
          .map((chunk) => chunk.chunk)
          .join("")
          .includes("Vamos a usar"),
      );

      const blocked = await app.request("/api/agents/run", {
        method: "POST",
        headers: { ...HOST, origin: "https://evil.example", "content-type": "application/json" },
        body: JSON.stringify({ agent: "claude", description: "x" }),
      });
      assert.equal(blocked.status, 403);

      const bad = await app.request("/api/agents/run", {
        method: "POST",
        headers: { ...HOST, "content-type": "application/json" },
        body: JSON.stringify({ agent: "unknown", description: "x" }),
      });
      assert.equal(bad.status, 400);

      const missing = await app.request("/api/agents/run/nope/cancel", { method: "POST", headers: HOST });
      assert.equal(missing.status, 404);
    },
    { FAKE_AGENT_MODE: "claude" },
  );
});

test("POST /api/agents/run returns 409 while a run is active and cancels it", async () => {
  const bin = fakeBins();
  bin.exe("claude");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-agents-vault-"));
  const published: (AgentRunEvent | AgentRunDoneEvent)[] = [];
  const events = {
    publish: (event: AgentRunEvent | AgentRunDoneEvent) => published.push(event),
  } as unknown as EventHub;

  await withFakePath(
    bin.dir,
    async () => {
      const app = createApp({ root, events });
      const first = await app.request("/api/agents/run", {
        method: "POST",
        headers: { ...HOST, "content-type": "application/json" },
        body: JSON.stringify({ agent: "claude", description: "REST API" }),
      });
      assert.equal(first.status, 202);
      const { runId } = (await first.json()) as { runId: string };

      const second = await app.request("/api/agents/run", {
        method: "POST",
        headers: { ...HOST, "content-type": "application/json" },
        body: JSON.stringify({ agent: "claude", description: "again" }),
      });
      assert.equal(second.status, 409);
      assert.equal(((await second.json()) as { error: string }).error, "conflict");

      const cancelled = await app.request(`/api/agents/run/${runId}/cancel`, { method: "POST", headers: HOST });
      assert.equal(cancelled.status, 204);

      const done = await new Promise<AgentRunDoneEvent>((resolve) => {
        const timer = setInterval(() => {
          const event = published.find((item): item is AgentRunDoneEvent => item.type === "agent-run-done" && item.runId === runId);
          if (event) {
            clearInterval(timer);
            resolve(event);
          }
        }, 10);
      });
      assert.equal(done.ok, false);
      assert.equal(done.error, "cancelled");
    },
    { FAKE_AGENT_MODE: "sleep" },
  );
});

test("POST /api/agents/run returns 400 when the CLI is not installed", async () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "basics-agents-empty-"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-agents-vault-"));
  await withFakePath(empty, async () => {
    const app = createApp({ root });
    const res = await app.request("/api/agents/run", {
      method: "POST",
      headers: { ...HOST, "content-type": "application/json" },
      body: JSON.stringify({ agent: "codex", description: "REST API" }),
    });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, "invalid");
  });
});

test("the headless prompt carries the plan-stack rules and the decision suffix", async () => {
  const bin = fakeBins();
  bin.exe("claude");
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "basics-agents-root-"));
  const log = path.join(tempRoot, "invocation.json");
  await withFakePath(
    bin.dir,
    async () => {
      const app = createApp({ root: tempRoot });
      const res = await app.request("/api/agents/run", {
        method: "POST",
        headers: { ...HOST, "content-type": "application/json" },
        body: JSON.stringify({ agent: "claude", description: "REST API in Python", layers: ["backend", "testing"] }),
      });
      assert.equal(res.status, 202);
      const { runId } = (await res.json()) as { runId: string };
      await new Promise<void>((resolve) => {
        const timer = setInterval(() => {
          if (fs.existsSync(log)) {
            clearInterval(timer);
            resolve();
          }
        }, 10);
      });
      const prompt = (JSON.parse(fs.readFileSync(log, "utf8")) as { args: string[] }).args[1];
      assert.ok(prompt.includes("REST API in Python"));
      assert.ok(prompt.includes("Only consider these layers: backend, testing."));
      assert.ok(prompt.includes("propose_note"));
      assert.ok(prompt.endsWith(AGENT_DECISION_SUFFIX));
      // The run is over by now; the fake wrote nothing into the vault root.
      assert.deepEqual(
        fs.readdirSync(tempRoot).filter((name) => name !== "invocation.json"),
        [],
      );
      void runId;
    },
    { FAKE_AGENT_MODE: "claude", FAKE_AGENT_LOG: log },
  );
});
