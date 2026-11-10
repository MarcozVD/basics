import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { clientArguments, isolatedEnvironment, runLive } from "../../../scripts/eval-agent-roles-live.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-role-live-test-"));
  const vault = path.join(root, "vault");
  const project = path.join(root, "project");
  fs.mkdirSync(vault);
  fs.mkdirSync(path.join(project, "src"), { recursive: true });
  fs.writeFileSync(path.join(vault, "accepted.md"), "accepted note");
  fs.writeFileSync(path.join(project, "src", "counter.tsx"), "counter source");
  fs.mkdirSync(path.join(project, "tests"));
  fs.writeFileSync(path.join(project, "tests/counter.spec.ts"), "original test");
  fs.writeFileSync(path.join(project, "playwright.config.ts"), "original config");
  fs.writeFileSync(path.join(project, "tsconfig.json"), "{}");
  return { root, vault, project, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("live eval blocks missing clients before creating fixtures or launching processes", async () => {
  const result = await runLive({
    resolveExe: () => undefined,
    execute: () => assert.fail("must not execute"),
    createFixture: () => assert.fail("must not create fixture"),
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.exitCode, 2);
  assert.match(result.reason, /claude CLI unavailable/);
});

test("live eval blocks missing authentication or browser prerequisites before agent calls", async () => {
  const result = await runLive({
    resolveExe: (name: string) => name,
    preflight: () => "Missing browser",
    execute: () => assert.fail("must not execute"),
    createFixture: () => assert.fail("must not create fixture"),
  });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reason, "Missing browser");
});

test("isolated environment preserves explicit provider keys but excludes external configs and injected code", () => {
  const home = path.resolve("isolated");
  const env = isolatedEnvironment(home, {
    OPENAI_API_KEY: "test-only",
    NODE_OPTIONS: "external preload",
    OPENCODE_CONFIG: "external config",
    OPENCODE_CONFIG_CONTENT: "external inline",
    CLAUDE_CONFIG_DIR: "external config",
    CODEX_HOME: "external config",
  });
  assert.equal(env.CODEX_API_KEY, "test-only");
  assert.equal(env.HOME, home);
  assert.equal(env.USERPROFILE, home);
  assert.equal(env.CODEX_HOME, path.join(home, ".codex"));
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.OPENCODE_CONFIG, undefined);
  assert.equal(env.OPENCODE_CONFIG_CONTENT, undefined);
});

test("client invocations keep the complete prompt as one argument and use isolated MCP configuration", () => {
  const prompt = "fix counter; $(must remain literal)";
  const claude = clientArguments("claude", prompt, "isolated/mcp.json");
  assert.equal(claude[1], prompt);
  assert.ok(claude.includes("--strict-mcp-config"));
  assert.ok(claude.includes("isolated/mcp.json"));
  const codex = clientArguments("codex", prompt, "unused");
  assert.equal(codex[1], prompt);
  assert.ok(codex.includes("workspace-write"));
  assert.deepEqual(clientArguments("opencode", prompt, "unused"), ["run", prompt, "--format", "json"]);
});

test("manual orchestration has exactly three conversations and missing evidence never passes", async () => {
  const temp = fixture();
  let closed = false;
  const conversations: string[] = [];
  try {
    const result = await runLive({
      core: {},
      createFixture: () => temp,
      resolveExe: (name: string) => name,
      preflight: () => undefined,
      projectUrl: "http://127.0.0.1:4920",
      startCapture: () => ({
        url: (role: string) => `http://127.0.0.1:4820/${role}/mcp`,
        close: () => {
          closed = true;
        },
      }),
      evaluate: () => assert.fail("missing evidence must not reach evaluator"),
      execute: ({ exe, args, env }: { exe: string; args: string[]; env: Record<string, string> }) => {
        assert.ok(env.HOME.startsWith(temp.root));
        if (args[0] !== "--version") conversations.push(exe);
        return { exitCode: 0, stdout: "mock output", stderr: "" };
      },
    });
    assert.deepEqual(conversations, ["claude", "codex", "opencode"]);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.exitCode, 2);
    assert.match(result.reason, /Missing independently captured/);
    assert.ok(closed);
    const config = fs.readFileSync(path.join(temp.root, "homes/codex/.codex/config.toml"), "utf8");
    assert.ok(config.includes('\nurl = "http://127.0.0.1:4820/dev/mcp"'));
    const wrapper = fs.readFileSync(path.join(temp.project, "eval-check.mjs"), "utf8");
    assert.ok(wrapper.includes("await fetch("));
    assert.ok(!wrapper.includes("spawnSync"));
    assert.ok(!wrapper.includes("commands.jsonl"));
    assert.ok(fs.existsSync(path.join(temp.root, "manifest.json")));
  } finally {
    temp.cleanup();
  }
});

test("authentication errors stop before the next role and retain review artifacts", async () => {
  const temp = fixture();
  const conversations: string[] = [];
  try {
    const result = await runLive({
      core: {},
      createFixture: () => temp,
      resolveExe: (name: string) => name,
      preflight: () => undefined,
      projectUrl: "http://127.0.0.1:4920",
      startCapture: () => ({ url: () => "http://127.0.0.1:4820/orchestrator/mcp", close: () => {} }),
      execute: ({ exe, args }: { exe: string; args: string[] }) => {
        if (args[0] === "--version") return { exitCode: 0, stdout: "version", stderr: "" };
        conversations.push(exe);
        return { exitCode: 1, stdout: "", stderr: "authentication required" };
      },
    });
    assert.deepEqual(conversations, ["claude"]);
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.artifacts, temp.root);
    assert.ok(fs.existsSync(path.join(temp.root, "manifest.json")));
  } finally {
    temp.cleanup();
  }
});

test("live trace captures real MCP results without launching an agent", async () => {
  const { startCapture } = await import("../../../scripts/eval-agent-roles-live.mjs");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const temp = fixture();
  fs.cpSync(path.resolve("examples/vault"), temp.vault, { recursive: true });
  const calls: { role: string; name: string; seq: number; result: { isError?: boolean; content: unknown[] } }[] = [];
  let seq = 0;
  const traceFile = path.join(temp.root, "trace.jsonl");
  const capture = await startCapture({
    vault: temp.vault,
    calls,
    roleNow: () => "orchestrator",
    nextSeq: () => ++seq,
    observe: () => {},
    traceFile,
  });
  const client = new Client({ name: "live-eval-test", version: "1" });
  try {
    const url = new URL(capture.url("orchestrator"));
    assert.ok(Number(url.port) >= 4820);
    await client.connect(new StreamableHTTPClientTransport(url));
    const result = await client.callTool({ name: "get_note", arguments: { id: "react" } });
    assert.ok(!result.isError);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "get_note");
    assert.equal(calls[0].role, "orchestrator");
    assert.deepEqual(calls[0].result, result);
    assert.ok(fs.readFileSync(traceFile, "utf8").includes('"method":"tools/call"'));
  } finally {
    await client.close();
    await capture.close();
    temp.cleanup();
  }
});

test("Playwright evidence requires actual successful reports for both browsers", async () => {
  const { playwrightEvidence } = await import("../../../scripts/eval-agent-roles-live.mjs");
  const passed = (projectName: string) => ({ projectName, status: "expected", results: [{ status: "passed" }] });
  const report = {
    stats: { expected: 2, unexpected: 0, skipped: 0 },
    suites: [{ specs: [{ tests: [passed("chromium"), passed("firefox")] }] }],
  };
  assert.deepEqual(playwrightEvidence(JSON.stringify(report)).browsers, ["chromium", "firefox"]);
  assert.deepEqual(playwrightEvidence("not JSON").browsers, []);
  assert.deepEqual(playwrightEvidence(JSON.stringify({ stats: report.stats, suites: [] })).browsers, []);
  assert.deepEqual(playwrightEvidence(JSON.stringify({ ...report, stats: { ...report.stats, skipped: 1 } })).browsers, []);
  report.suites[0].specs[0].tests[1].results[0].status = "failed";
  assert.deepEqual(playwrightEvidence(JSON.stringify(report)).browsers, ["chromium"]);
});

test("browser cache path survives isolated home and model metadata comes from transcripts", async () => {
  const { browserEnvironment, transcriptModels } = await import("../../../scripts/eval-agent-roles-live.mjs");
  const original = { PLAYWRIGHT_BROWSERS_PATH: "/explicit/test-browsers" };
  assert.equal(browserEnvironment(original), original);
  assert.equal(isolatedEnvironment("isolated", browserEnvironment(original)).PLAYWRIGHT_BROWSERS_PATH, original.PLAYWRIGHT_BROWSERS_PATH);
  assert.deepEqual(transcriptModels('not json\n{"message":{"model":"test-model"}}\n{"part":{"modelID":"second-model"}}'), [
    "test-model",
    "second-model",
  ]);
});

test("cleanup errors retain BLOCKED result rather than throwing", async () => {
  const temp = fixture();
  try {
    const result = await runLive({
      core: {},
      createFixture: () => temp,
      resolveExe: (name: string) => name,
      preflight: () => undefined,
      projectUrl: "http://127.0.0.1:4920",
      baseSha: "test-sha",
      startCapture: () => ({
        url: () => "http://127.0.0.1:4820/orchestrator/mcp",
        close: () => {
          throw new Error("cleanup failure");
        },
      }),
      execute: () => ({ exitCode: 1, stdout: "", stderr: "version unavailable" }),
    });
    assert.equal(result.status, "BLOCKED");
    const manifest = JSON.parse(fs.readFileSync(path.join(temp.root, "manifest.json"), "utf8"));
    assert.equal(manifest.cleanupError, "cleanup failure");
    assert.equal(manifest.baseSha, "test-sha");
  } finally {
    temp.cleanup();
  }
});

test("project snapshots catch source, test and config tampering while ignoring generated reports", async () => {
  const { projectFiles } = await import("../../../scripts/eval-agent-roles-live.mjs");
  const temp = fixture();
  try {
    fs.writeFileSync(path.join(temp.project, "tests/counter.spec.ts"), "original test");
    fs.writeFileSync(path.join(temp.project, "playwright.config.ts"), "original config");
    const before = projectFiles(temp.project);
    fs.mkdirSync(path.join(temp.project, "test-results"));
    fs.writeFileSync(path.join(temp.project, "test-results/report.txt"), "generated output");
    fs.writeFileSync(path.join(temp.project, "eval-check.mjs"), "harness wrapper");
    assert.deepEqual(projectFiles(temp.project), before);
    fs.writeFileSync(path.join(temp.project, "tests/counter.spec.ts"), "weakened test");
    assert.notDeepEqual(projectFiles(temp.project), before);
    fs.writeFileSync(path.join(temp.project, "tests/counter.spec.ts"), "original test");
    fs.writeFileSync(path.join(temp.project, "playwright.config.ts"), "weakened config");
    assert.notDeepEqual(projectFiles(temp.project), before);
  } finally {
    temp.cleanup();
  }
});

test("runner executes fixed check commands and rejects changed test contracts", async () => {
  const { runObservedCheck } = await import("../../../scripts/eval-agent-roles-live.mjs");
  const { checkContract } = await import("../../../scripts/agent-roles-fixture.mjs");
  const temp = fixture();
  try {
    const contract = checkContract(temp.project);
    let executions = 0;
    const execute = ({ exe, args }: { exe: string; args: string[] }) => {
      executions++;
      assert.equal(exe, process.execPath);
      assert.deepEqual(args.slice(1), ["--noEmit"]);
      return { exitCode: 0, stdout: "", stderr: "" };
    };
    const result = await runObservedCheck({
      fixture: temp,
      role: "tester",
      kind: "typecheck",
      revision: "test-sha",
      env: {},
      contract,
      execute,
    });
    assert.equal(result.check.origin, "runner");
    assert.equal(result.check.executed, true);
    assert.equal(result.check.exitCode, 0);
    assert.equal(result.check.revision, "test-sha");
    assert.match(result.check.artifact, /^[a-f0-9]{64}$/);
    assert.ok(result.check.completedAt <= Date.now());
    assert.ok(fs.existsSync(result.check.evidence));
    fs.writeFileSync(path.join(temp.project, "tests/counter.spec.ts"), "weakened test");
    const blocked = await runObservedCheck({
      fixture: temp,
      role: "tester",
      kind: "typecheck",
      revision: "test-sha",
      env: {},
      contract,
      execute,
    });
    assert.equal(blocked.check.exitCode, 1);
    assert.equal(blocked.check.executed, false);
    assert.equal(executions, 1);
  } finally {
    temp.cleanup();
  }
});
