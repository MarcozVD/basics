import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type Candidate, type Recommendation, trust, Vault } from "@marcozvd/basics-core";
import { acceptanceMetrics, summarizeAcceptance } from "@marcozvd/basics-core/compare";
import { test, vi } from "vitest";
import { AgentProcessTree } from "../src/agent-process-tree.js";
import { AgentRunner } from "../src/agents.js";
import * as comparison from "../src/compare.js";
import {
  type CompareDependencies,
  compareErrorMessage,
  expectedCompareStack,
  metricStats,
  parseCompareConditions,
  resolveCompareTask,
  runComparison,
} from "../src/compare.js";
import { acceptanceResult, stageAcceptance } from "../src/compare-acceptance.js";
import { prepareCompareEnvironment } from "../src/compare-environment.js";
import { CompareDirectories, fileChanges, snapshotFiles } from "../src/compare-files.js";
import { buildProgram } from "../src/program.js";

const PACKS = path.resolve(import.meta.dirname, "../../../packs");

test("CLI text and JSON expose the same per-run acceptance rates and fully-passing share", async () => {
  const f = fixture();
  const config = path.join(f.base, "config.json");
  fs.writeFileSync(config, JSON.stringify({ vault: f.vault.root, language: "en", embeddings: false }));
  vi.stubEnv("BASICS_CONFIG", config);
  const report = JSON.parse(
    fs.readFileSync(path.resolve(import.meta.dirname, "../../../scripts/demo/compare-recorded.json"), "utf8"),
  ) as Awaited<ReturnType<typeof runComparison>>;
  const first = report.results[0];
  const acceptance = { status: "fail" as const, passed: 3, failed: 1, duration_ms: 0 };
  first.condition = "none";
  first.acceptance = { ...acceptance, ...acceptanceMetrics(acceptance) };
  const full = { status: "pass" as const, passed: 100, failed: 0, duration_ms: 0 };
  report.results = [first, { ...first, run: 2, acceptance: { ...full, ...acceptanceMetrics(full) } }];
  report.summary = { none: { ...report.summary.without_basics, ...summarizeAcceptance(report.results) } };
  const runner = vi.spyOn(comparison, "runComparison").mockResolvedValue(report);
  const output = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await buildProgram().parseAsync(["compare", "test", "--agent", "claude", "--yes"], { from: "user" });
    const text = output.mock.calls.map((call) => call.join(" ")).join("\n");
    assert.match(text, /pass_rate=0\.75; all_passed=false/);
    assert.match(text, /acceptance pass rate mean=0\.8750; fully passing run share=0\.5000/);
    output.mockClear();
    await buildProgram().parseAsync(["compare", "test", "--agent", "claude", "--yes", "--json"], { from: "user" });
    const json = JSON.parse(String(output.mock.calls[0][0]));
    assert.equal(json.results[0].acceptance.pass_rate, 0.75);
    assert.equal(json.results[0].acceptance.all_passed, false);
    assert.equal(json.summary.none.acceptance_passed.mean, 0.875);
    assert.equal(json.summary.none.acceptance_all_passed.mean, 0.5);
  } finally {
    runner.mockRestore();
    output.mockRestore();
    vi.unstubAllEnvs();
    f.cleanup();
  }
});

test("conditions validate before launch and preserve explicit order", () => {
  assert.deepEqual(parseCompareConditions(undefined), ["none", "agents-md", "basics"]);
  assert.deepEqual(parseCompareConditions("basics,none"), ["basics", "none"]);
  for (const invalid of ["", "none,", "none,none", "with_basics", "other"])
    assert.throws(() => parseCompareConditions(invalid), /conditions/);
});

test("agents-md exports equal basics byte for byte with every MCP configuration empty", () => {
  const f = fixture();
  try {
    for (const agent of ["claude", "opencode", "codex"] as const) {
      const prepared = ["agents-md", "basics"].map((condition) => {
        const root = fs.mkdtempSync(path.join(f.tempRoot, "exports-"));
        return prepareCompareEnvironment(root, agent, f.vault, ["react"], condition as "agents-md" | "basics", f.deps.env, f.authHome);
      });
      assert.deepEqual(snapshotFiles(prepared[0].project).files, snapshotFiles(prepared[1].project).files);
      for (const file of ["AGENTS.md", "CLAUDE.md", "STACK.md"]) assert.ok(fs.existsSync(path.join(prepared[0].project, file)));
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(prepared[0].control, "mcp.json"), "utf8")).mcpServers, {});
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(prepared[0].control, "opencode.json"), "utf8")).mcp, {});
      assert.equal(fs.readFileSync(path.join(prepared[0].env.CODEX_HOME, "config.toml"), "utf8"), "");
    }
  } finally {
    f.cleanup();
  }
});

test("all fake event formats deduplicate MCP calls and flag study reads for summary exclusion", async () => {
  const f = fixture();
  try {
    for (const agent of ["claude", "opencode", "codex"] as const) {
      const model =
        agent === "claude" ? "claude-haiku-fixture" : agent === "opencode" ? "tokenharbor1/deepseek-v4.1-flash-1017" : undefined;
      const report = await runComparison(
        f.vault,
        { agent, model, task: "dashboard", conditions: ["basics"], yes: true, timeoutMs: 15000 },
        { ...f.deps, env: { ...f.deps.env, FAKE_COMPARE_MODE: "mcp-events" } },
      );
      assert.deepEqual(report.results[0].mcp_tool_calls, { total: 1, by_tool: { get_note: 1 } });
      if (model) assert.equal(report.results[0].resolved_model, model);
      assert.equal(report.results[0].contaminated, false);
      const contaminated = await runComparison(
        f.vault,
        { agent, task: "dashboard", conditions: ["none"], studyDir: path.join(f.base, "study"), yes: true, timeoutMs: 15000 },
        { ...f.deps, env: { ...f.deps.env, FAKE_COMPARE_MODE: "contamination" } },
      );
      assert.equal(contaminated.results[0].contaminated, true);
      assert.equal(contaminated.summary.none.runs, 0);
      assert.equal(contaminated.summary.none.contaminated_runs, 1);
      assert.ok(!JSON.stringify(contaminated.results[0].contamination_reasons).includes(f.base));
    }
  } finally {
    f.cleanup();
  }
}, 60000);

test("acceptance count envelope rejects logs, malformed counts and inconsistent exits", () => {
  assert.deepEqual(acceptanceResult('{"passed":2,"failed":0}\n', "pass", 4), { status: "pass", passed: 2, failed: 0, duration_ms: 4 });
  assert.equal(acceptanceResult('{"passed":1,"failed":1}', "fail", 1).status, "fail");
  for (const output of [
    "",
    'log\n{"passed":1,"failed":0}',
    '{"passed":-1,"failed":0}',
    '{"passed":1.5,"failed":0}',
    '{"passed":1,"failed":0,"extra":1}',
    '{"passed":9007199254740992,"failed":0}',
  ])
    assert.equal(acceptanceResult(output, "pass", 0).status, "error");
  assert.equal(acceptanceResult('{"passed":1,"failed":0}', "fail", 0).status, "error");
  assert.equal(acceptanceResult('{"passed":1,"failed":0}', "timeout", 0).status, "error");
});

test("acceptance extraction refuses traversal and agent-created destination", () => {
  const f = fixture();
  try {
    const project = fs.mkdtempSync(path.join(f.tempRoot, "stage-"));
    const bundle = path.join(f.base, "bundle.json");
    fs.writeFileSync(bundle, JSON.stringify({ files: { "../escape": "unsafe" } }));
    assert.throws(() => stageAcceptance({ bundle, command: "unused" }, project), /unsafe/);
    assert.equal(fs.existsSync(path.join(project, ".basics-acceptance")), false);
    fs.writeFileSync(bundle, JSON.stringify({ files: { "check.cjs": "test" } }));
    fs.mkdirSync(path.join(project, ".basics-acceptance"));
    assert.throws(() => stageAcceptance({ bundle, command: "unused" }, project), /exist/i);
  } finally {
    f.cleanup();
  }
});

test("unconfirmed shutdown, timeout and cancellation never extract acceptance files", async () => {
  const f = fixture();
  try {
    const hidden = path.join(f.base, "hidden");
    fs.mkdirSync(hidden);
    const bundle = path.join(hidden, "bundle.json");
    fs.writeFileSync(bundle, JSON.stringify({ files: { "verify.cjs": "console.log(JSON.stringify({passed:1,failed:0}))" } }));
    const acceptance = { bundle, command: `"${process.execPath.replaceAll("\\", "/")}" .basics-acceptance/verify.cjs` };
    const original = AgentProcessTree.prototype.shutdown;
    const unconfirmed = vi.spyOn(AgentProcessTree.prototype, "shutdown").mockImplementation(async function (this: AgentProcessTree) {
      await original.call(this);
      this.diagnostics = { reason: "Live POSIX process-group members remain", processes: [{ pid: 4243, pgid: 4242, state: "S+" }] };
      return false;
    });
    try {
      const report = await runComparison(
        f.vault,
        { agent: "claude", task: "dashboard", conditions: ["none"], yes: true, trustChecks: true, keep: true, acceptance },
        f.deps,
      );
      assert.equal(report.results[0].shutdown_confirmed, false);
      assert.equal(report.results[0].shutdown_diagnostics?.processes[0].state, "S+");
      assert.match(report.results[0].acceptance!.reason!, /unconfirmed/);
      assert.equal(fs.existsSync(path.join(report.results[0].directory!, ".basics-acceptance")), false);
    } finally {
      unconfirmed.mockRestore();
    }
    for (const cancel of [false, true]) {
      const abort = new AbortController();
      const timer = cancel ? setTimeout(() => abort.abort(), 250) : undefined;
      try {
        const report = await runComparison(
          f.vault,
          {
            agent: "claude",
            task: "dashboard",
            conditions: ["none"],
            yes: true,
            trustChecks: true,
            keep: true,
            acceptance,
            timeoutMs: cancel ? 10000 : 250,
          },
          { ...f.deps, signal: abort.signal, env: { ...f.deps.env, FAKE_COMPARE_MODE: "sleep" } },
        );
        assert.equal(report.results[0].acceptance?.status, "error");
        assert.equal(fs.existsSync(path.join(report.results[0].directory!, ".basics-acceptance")), false);
      } finally {
        clearTimeout(timer);
      }
    }
  } finally {
    f.cleanup();
  }
}, 40000);

test("clean Windows exit and surviving grandchild both confirm shutdown before acceptance staging", async () => {
  const f = fixture();
  try {
    const source = path.join(f.base, "hidden");
    fs.mkdirSync(source);
    const bundle = path.join(source, "bundle.json");
    fs.writeFileSync(bundle, JSON.stringify({ files: { "verify.cjs": "console.log(JSON.stringify({passed:1,failed:0}));" } }));
    const acceptance = { bundle, command: `"${process.execPath.replaceAll("\\", "/")}" .basics-acceptance/verify.cjs` };
    for (const mode of [undefined, "grandchild"]) {
      const report = await runComparison(
        f.vault,
        {
          agent: "claude",
          task: "dashboard",
          conditions: ["none"],
          yes: true,
          trustChecks: true,
          keep: true,
          timeoutMs: 20000,
          acceptance,
        },
        { ...f.deps, env: { ...f.deps.env, FAKE_COMPARE_MODE: mode } },
      );
      const result = report.results[0];
      assert.equal(
        result.shutdown_confirmed,
        true,
        JSON.stringify({ mode: mode ?? "clean", shutdown_diagnostics: result.shutdown_diagnostics }),
      );
      assert.equal(result.acceptance?.status, "pass", JSON.stringify(result.acceptance));
      assert.deepEqual([result.acceptance?.passed, result.acceptance?.failed], [1, 0]);
      assert.ok(fs.existsSync(path.join(result.directory!, ".basics-acceptance/verify.cjs")));
      assert.ok(!result.files?.added.some((file) => file.startsWith(".basics-acceptance")));
      const argv = fs.readFileSync(path.join(result.directory!, "argv.json"), "utf8");
      assert.ok(!argv.includes(bundle) && !argv.includes(".basics-acceptance"));
      assert.equal(fs.existsSync(path.join(source, "verify.cjs")), false, "bundle never extracted at its source");
      if (mode)
        for (const file of ["child-pid", "grandchild-pid"]) {
          const pid = Number(fs.readFileSync(path.join(result.directory!, file), "utf8"));
          try {
            process.kill(pid, 0);
          } catch (error) {
            assert.equal((error as NodeJS.ErrnoException).code, "ESRCH");
            continue;
          }
          if (process.platform === "win32") assert.fail(`Descendant ${pid} remains alive`);
          // Darwin kill(pid, 0) also succeeds for zombies. A zombie has exited
          // and cannot observe acceptance tests, even before launchd reaps it.
          let state: string;
          try {
            state = execFileSync("/bin/ps", ["-p", String(pid), "-o", "stat="], { encoding: "utf8" }).trim();
          } catch (error) {
            const missing = error as { status?: number; stdout?: string };
            if (missing.status === 1 && !String(missing.stdout ?? "").trim()) continue;
            throw error;
          }
          assert.match(state, /^Z/, `Descendant ${pid} remains executable: ${state}`);
        }
    }
    const denied = await runComparison(
      f.vault,
      { agent: "claude", task: "dashboard", conditions: ["none"], yes: true, keep: true, acceptance, timeoutMs: 15000 },
      f.deps,
    );
    assert.match(denied.results[0].acceptance!.reason!, /not approved/);
    assert.equal(fs.existsSync(path.join(denied.results[0].directory!, ".basics-acceptance")), false);
  } finally {
    f.cleanup();
  }
}, 60000);
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "basics-compare-test-"));
  const vaultRoot = path.join(base, "vault"),
    tempRoot = path.join(base, "runs"),
    authHome = path.join(base, "auth"),
    bin = path.join(base, "bin");
  for (const dir of [vaultRoot, tempRoot, authHome, bin]) fs.mkdirSync(dir);
  const vault = Vault.load(vaultRoot);
  vault.writeNote("frontend", { type: "layer", tags: [], source: "manual" }, "");
  vault.writeNote(
    "react",
    {
      type: "tech",
      kind: "framework",
      layer: "frontend",
      use_when: ["dashboard"],
      packages: { npm: ["react"] },
      checks: ["verify"],
      tags: [],
      source: "manual",
    },
    "",
  );
  vault.writeNote(
    "verify",
    {
      type: "check",
      kind: "test",
      applies_to: ["react"],
      command: `"${process.execPath.replaceAll("\\", "/")}" verify.cjs`,
      tags: [],
      source: "manual",
    },
    "",
  );
  const script = path.join(bin, "fake.cjs");
  fs.copyFileSync(path.join(import.meta.dirname, "fixtures/compare-agent.cjs"), script);
  const exes: Record<string, string> = {};
  for (const agent of ["claude", "opencode", "codex"]) {
    const file = path.join(bin, agent + (process.platform === "win32" ? ".cmd" : ""));
    fs.writeFileSync(
      file,
      process.platform === "win32"
        ? `@echo off\r\n"%~dp0\\node.exe" "${script}" %*\r\n`
        : `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`,
    );
    if (process.platform !== "win32") fs.chmodSync(file, 0o755);
    exes[agent] = file;
  }
  const deps: CompareDependencies = {
    packsDir: PACKS,
    tempRoot,
    authHome,
    resolveExe: (agent) => exes[agent],
    env: { ...process.env, PATH: bin },
  };
  const owner = new CompareDirectories();
  owner.own(base);
  return { base, vault, tempRoot, authHome, bin, deps, cleanup: () => owner.remove(base) };
}
test("agent error paths are removed before saving history while agent identity remains", async () => {
  assert.equal(
    compareErrorMessage("Could not reach https://example.invalid/api", "claude"),
    "claude: Could not reach https://example.invalid/api",
  );
  for (const error of [
    'Could not start "C:\\Program Files\\Claude\\claude.exe"',
    "spawn C:/Users/private/agent.exe ENOENT",
    "spawn /usr/local/bin/agent ENOENT",
    "Failed in '/private/agent tools/work'",
    "spawn \\\\server\\private\\agent.exe ENOENT",
  ]) {
    const safe = compareErrorMessage(error, "claude")!;
    assert.match(safe, /^claude: /);
    assert.match(safe, /<path>/);
    assert.doesNotMatch(safe, /[A-Za-z]:[\\/]|\/usr\/|\/private\/|\\\\server/);
    assert.equal(compareErrorMessage(safe, "claude"), safe);
  }
  const f = fixture();
  try {
    const report = await runComparison(
      f.vault,
      { agent: "claude", task: "dashboard", yes: true },
      {
        ...f.deps,
        env: { ...f.deps.env, FAKE_COMPARE_MODE: "fail-path" },
      },
    );
    const stored = JSON.parse(fs.readFileSync(report.file, "utf8"));
    for (const result of stored.results) {
      assert.equal(result.ok, false);
      assert.match(result.error, /^claude: /);
      assert.doesNotMatch(result.error, /[A-Za-z]:[\\/]|\/private\//);
      assert.ok(!result.error.includes(process.execPath));
    }
  } finally {
    f.cleanup();
  }
});

test("confirmation refuses non-TTY, declined confirmation and missing agents before starting anything", async () => {
  const f = fixture();
  try {
    const announce = vi.fn();
    const confirm = vi.fn(async () => false);
    await assert.rejects(
      runComparison(f.vault, { agent: "claude", task: "dashboard" }, { ...f.deps, isTTY: false, announce, confirm }),
      /--yes/,
    );
    assert.equal(confirm.mock.calls.length, 0);
    assert.match(announce.mock.calls[0][0], /3 agent runs/);
    await assert.rejects(runComparison(f.vault, { agent: "claude", task: "dashboard" }, { ...f.deps, isTTY: true, confirm }), /cancelled/);
    await assert.rejects(
      runComparison(f.vault, { agent: "claude", task: "dashboard", yes: true }, { ...f.deps, resolveExe: () => undefined }),
      /not installed/,
    );
    assert.deepEqual(fs.readdirSync(f.tempRoot), []);
    assert.equal(fs.existsSync(path.join(f.vault.root, ".basics/compare")), false);
  } finally {
    f.cleanup();
  }
});
test("--yes never grants check trust, including trust for another directory or a different command", async () => {
  const f = fixture();
  try {
    const sentinel = path.join(f.base, "check-ran");
    const command = `"${process.execPath.replaceAll("\\", "/")}" -e "require('node:fs').writeFileSync('${sentinel.replaceAll("\\", "/")}', 'unsafe')"`;
    f.vault.writeNote("verify", { type: "check", kind: "test", applies_to: ["react"], command, tags: [], source: "manual" }, "");
    trust(f.vault, f.base, command);
    const plans: string[] = [];
    const confirmChecks = vi.fn(async () => true);
    const report = await runComparison(
      f.vault,
      { agent: "claude", task: "dashboard", yes: true },
      {
        ...f.deps,
        isTTY: false,
        confirmChecks,
        announce(message) {
          plans.push(message);
          if (message.startsWith("Check directory: ")) trust(f.vault, message.slice("Check directory: ".length), `${command} changed`);
        },
      },
    );
    assert.equal(fs.existsSync(sentinel), false);
    assert.equal(confirmChecks.mock.calls.length, 0);
    assert.equal(report.trust_checks, false);
    for (const result of report.results) {
      assert.match(result.checks[0].hint!, /basics check <project>/);
      assert.ok(!result.checks[0].hint!.includes(f.base));
      assert.doesNotMatch(result.checks[0].hint!, /[A-Za-z]:[\\/]|\/(?:tmp|private|var|Users|home)\//);
    }
    assert.ok(report.results.every((r) => r.ok && r.checks_passed === 0 && r.checks[0].status === "untrusted"));
    assert.ok(
      report.results.every((r) => r.checks[0].command === command && /basics check .* --only verify --trust/.test(r.checks[0].hint!)),
    );
    assert.match(plans.join("\n"), /untrusted \(will not run\)/);
    assert.deepEqual(fs.readdirSync(f.tempRoot), []);
  } finally {
    f.cleanup();
  }
});

test("--trust-checks runs only invocation checks without persisting trust or implying agent approval", async () => {
  const f = fixture();
  try {
    const confirmChecks = vi.fn(async () => false);
    const announce = vi.fn();
    await assert.rejects(
      runComparison(
        f.vault,
        { agent: "claude", task: "dashboard", trustChecks: true },
        {
          ...f.deps,
          isTTY: false,
          confirmChecks,
        },
      ),
      /--yes/,
    );
    const report = await runComparison(
      f.vault,
      { agent: "claude", task: "dashboard", yes: true, trustChecks: true },
      {
        ...f.deps,
        isTTY: false,
        confirmChecks,
        announce,
      },
    );
    assert.equal(confirmChecks.mock.calls.length, 0);
    assert.equal(report.trust_checks, true);
    assert.deepEqual(
      report.results.map((r) => r.checks[0].status),
      ["fail", "pass", "pass"],
    );
    assert.deepEqual(
      report.results.map((r) => r.checks_passed),
      [0, 1, 1],
    );
    assert.match(announce.mock.calls.map((call) => call[0]).join("\n"), /will run \(--trust-checks\).*verify.cjs/);
    assert.equal(fs.existsSync(path.join(f.vault.root, ".basics/trust.json")), false);
    const next = await runComparison(f.vault, { agent: "claude", task: "dashboard", yes: true }, { ...f.deps, isTTY: false });
    assert.ok(next.results.every((r) => r.checks[0].status === "untrusted"));
  } finally {
    f.cleanup();
  }
});

test("interactive check approval is separate: accept runs checks, decline or no answer leaves them untrusted", async () => {
  const f = fixture();
  try {
    const order: string[] = [];
    const trustFile = path.join(f.vault.root, ".basics/trust.json");
    trust(f.vault, f.base, "existing unrelated trust");
    const beforeTrust = fs.readFileSync(trustFile, "utf8");
    for (const approved of [true, false, undefined]) {
      const confirm = vi.fn(async () => {
        order.push("agent");
        return true;
      });
      const confirmChecks = vi.fn(async (checks: { id: string; command: string }[]) => {
        order.push("checks");
        assert.deepEqual(
          checks.map((check) => check.id),
          ["verify"],
        );
        assert.match(checks[0].command, /verify.cjs/);
        assert.deepEqual(fs.readdirSync(f.tempRoot), [], "confirmation happens before starting either run");
        return approved === true;
      });
      const report = await runComparison(
        f.vault,
        { agent: "claude", task: "dashboard" },
        {
          ...f.deps,
          isTTY: true,
          confirm,
          confirmChecks: approved === undefined ? undefined : confirmChecks,
        },
      );
      assert.equal(confirm.mock.calls.length, 1);
      assert.equal(confirmChecks.mock.calls.length, approved === undefined ? 0 : 1);
      assert.deepEqual(
        report.results.map((r) => r.checks[0].status),
        approved ? ["fail", "pass", "pass"] : ["untrusted", "untrusted", "untrusted"],
      );
      assert.equal(fs.readFileSync(trustFile, "utf8"), beforeTrust);
    }
    assert.deepEqual(order, ["agent", "checks", "agent", "checks", "agent"]);
    const confirmChecks = vi.fn(async () => false);
    await runComparison(f.vault, { agent: "claude", task: "dashboard", yes: true }, { ...f.deps, isTTY: true, confirmChecks });
    assert.equal(confirmChecks.mock.calls.length, 1, "--yes must not bypass the separate interactive check prompt");
  } finally {
    f.cleanup();
  }
});

test("sample usage events normalize provider input and preserve separate optional cache counts", { timeout: 60_000 }, async () => {
  const f = fixture();
  try {
    for (const agent of ["claude", "codex", "opencode"] as const) {
      const report = await runComparison(
        f.vault,
        { agent, task: "dashboard", yes: true },
        {
          ...f.deps,
          env: { ...f.deps.env, FAKE_COMPARE_MODE: "cache-tokens" },
        },
      );
      for (const result of report.results) {
        assert.deepEqual(result.tokens, {
          input: agent === "claude" ? 12 : 24,
          output: agent === "claude" ? 5 : 10,
          total: agent === "claude" ? 17 : 34,
          cache_read: agent === "claude" ? 100 : 200,
          cache_creation: agent === "claude" ? 20 : 40,
        });
      }
      const noCache = await runComparison(f.vault, { agent, task: "dashboard", yes: true }, f.deps);
      assert.deepEqual(noCache.results[0].tokens, { input: 12, output: 5, total: 17 });
    }
    const fullyCached = await runComparison(
      f.vault,
      { agent: "codex", task: "dashboard", yes: true },
      {
        ...f.deps,
        env: { ...f.deps.env, FAKE_COMPARE_MODE: "fully-cached" },
      },
    );
    assert.deepEqual(fullyCached.results[0].tokens, { input: 0, output: 5, total: 5, cache_read: 100 });
  } finally {
    f.cleanup();
  }
});
test("paired fake runs measure real checks, detected stack, tokens, diffs and repeat aggregation, then clean everything", async () => {
  const f = fixture();
  try {
    fs.mkdirSync(path.join(f.vault.root, ".basics"));
    fs.writeFileSync(path.join(f.vault.root, ".basics/.gitignore"), "activity.jsonl\n");
    const confirm = vi.fn(async () => true);
    const report = await runComparison(
      f.vault,
      { agent: "claude", task: "dashboard", runs: 2, trustChecks: true },
      { ...f.deps, isTTY: true, confirm },
    );
    assert.equal(confirm.mock.calls.length, 1);
    assert.equal(report.results.length, 6);
    for (const result of report.results) {
      assert.equal(result.ok, true);
      assert.equal(result.tokens?.total, 17);
      assert.equal(result.stack_match, 1);
      assert.deepEqual(result.stack_used, { frontend: ["react"] });
      assert.equal(result.checks_passed, result.condition !== "none" ? 1 : 0);
      assert.equal(result.files?.added.length, 3);
      assert.equal(result.files?.changed.length, 0);
      assert.ok(result.wall_ms >= 0);
      assert.deepEqual(result.cleanup_errors, []);
    }
    assert.equal(report.summary.basics.wall_ms?.count, 2);
    assert.equal(report.summary.basics.tokens_total?.mean, 17);
    assert.deepEqual(metricStats([1, 3]), { count: 2, mean: 2, stddev: 1, min: 1, max: 3 });
    assert.deepEqual(fs.readdirSync(f.tempRoot), []);
    assert.ok(fs.existsSync(report.file));
    assert.match(fs.readFileSync(path.join(f.vault.root, ".basics/.gitignore"), "utf8"), /\/compare\//);
  } finally {
    f.cleanup();
  }
});
test("keep retains only projects, isolates config and passes the whole shell-like prompt as one argument for every agent", async () => {
  const f = fixture();
  try {
    fs.mkdirSync(path.join(f.authHome, ".claude"));
    fs.writeFileSync(path.join(f.authHome, ".claude/.credentials.json"), "test credential");
    const task = 'dashboard; echo OWNED && $(echo nope) "quoted"';
    for (const agent of ["claude", "opencode", "codex"] as const) {
      const report = await runComparison(f.vault, { agent, task, model: "test-model", yes: true, keep: true }, f.deps);
      const dirs = report.results.map((r) => r.directory!);
      assert.notEqual(dirs[0], dirs[1]);
      for (const result of report.results) {
        const project = result.directory!,
          root = path.dirname(project);
        assert.equal(fs.existsSync(path.join(root, "control")), false, "temporary auth/config is removed even with keep");
        const argv = JSON.parse(fs.readFileSync(path.join(project, "argv.json"), "utf8"));
        assert.ok(argv.args[1].startsWith(task));
        assert.equal(argv.args.filter((arg: string) => arg.includes("OWNED")).length, 1);
        assert.equal(argv.withBasics, result.condition !== "none");
        assert.equal(argv.initial.includes("AGENTS.md"), argv.withBasics);
        assert.equal(result.tokens?.total, 17);
        assert.ok(argv.args.includes("test-model"));
      }
    }
  } finally {
    f.cleanup();
  }
});
test("timeouts kill fake agents, record failures and still clean both conditions", async () => {
  const f = fixture();
  try {
    const report = await runComparison(
      f.vault,
      { agent: "claude", task: "dashboard", yes: true, timeoutMs: 150 },
      { ...f.deps, env: { ...f.deps.env, FAKE_COMPARE_MODE: "sleep" } },
    );
    assert.ok(report.results.every((r) => !r.ok && r.timed_out && r.tokens === null));
    assert.deepEqual(fs.readdirSync(f.tempRoot), []);
  } finally {
    f.cleanup();
  }
});

test("missing usage stays unavailable and nonzero agent exits remain failures with cleanup", async () => {
  const f = fixture();
  try {
    const noUsage = await runComparison(
      f.vault,
      { agent: "claude", task: "dashboard", yes: true },
      { ...f.deps, env: { ...f.deps.env, FAKE_COMPARE_MODE: "no-tokens" } },
    );
    assert.ok(noUsage.results.every((result) => result.ok && result.tokens === null));
    assert.equal(noUsage.summary.basics.tokens_total, null);
    const failed = await runComparison(
      f.vault,
      { agent: "claude", task: "dashboard", yes: true },
      { ...f.deps, env: { ...f.deps.env, FAKE_COMPARE_MODE: "fail" } },
    );
    assert.ok(failed.results.every((result) => !result.ok && /code 3/.test(result.error ?? "")));
    assert.deepEqual(fs.readdirSync(f.tempRoot), []);
  } finally {
    f.cleanup();
  }
});
test("unsafe output junctions are not followed by metrics or cleanup and outside files survive", async () => {
  const f = fixture();
  try {
    const outside = path.join(f.base, "outside");
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "sentinel"), "untouched");
    const report = await runComparison(
      f.vault,
      { agent: "claude", task: "dashboard", yes: true },
      { ...f.deps, env: { ...f.deps.env, FAKE_COMPARE_MODE: "link", FAKE_COMPARE_OUTSIDE: outside } },
    );
    assert.ok(report.results.every((r) => !r.ok && /symlink|junction/.test(r.error ?? "")));
    assert.deepEqual(fs.readdirSync(f.tempRoot), []);
    assert.equal(fs.readFileSync(path.join(outside, "sentinel"), "utf8"), "untouched");
    assert.throws(() => new CompareDirectories().remove(outside), /did not create/);
  } finally {
    f.cleanup();
  }
});
test("internal dependency links permit checks and are cleaned without traversing them", async () => {
  const f = fixture();
  try {
    const report = await runComparison(
      f.vault,
      { agent: "claude", task: "dashboard", yes: true, trustChecks: true },
      { ...f.deps, env: { ...f.deps.env, FAKE_COMPARE_MODE: "internal-link" } },
    );
    assert.ok(report.results.every((result) => result.ok));
    assert.equal(report.results[1].checks_passed, 1);
    assert.deepEqual(fs.readdirSync(f.tempRoot), []);
  } finally {
    f.cleanup();
  }
});

test("sample tasks use readPackTasks bilingual prompts, expected layers, and reject missing or conflicting inputs", () => {
  const task = resolveCompareTask({ agent: "claude", sample: "rust-api/login-api", language: "es" }, PACKS);
  assert.match(task.prompt, /Crea una API/);
  assert.deepEqual(task.expectedLayers, ["backend", "data", "testing"]);
  assert.throws(() => resolveCompareTask({ agent: "claude", task: "extra", sample: "rust-api/login-api" }, PACKS), /not both/);
  assert.throws(() => resolveCompareTask({ agent: "claude", sample: "rust-api/missing" }, PACKS), /not found/);
  for (const id of ["csv-report", "batch-pipeline", "notebook-module"])
    assert.deepEqual(resolveCompareTask({ agent: "claude", sample: `data-ml/${id}` }, PACKS).expectedLayers, ["data", "testing"]);
  assert.deepEqual(resolveCompareTask({ agent: "claude", sample: "data-ml/heldout-classifier" }, PACKS).expectedLayers, [
    "data",
    "ml",
    "testing",
  ]);
});

test("checks prefer project venv and npm tools, distinguish missing tools from failing checks", { timeout: 60_000 }, async () => {
  const f = fixture();
  try {
    const commands = {
      verify: "ruff check . && ruff format --check . && mypy .",
      mypy: "mypy --version",
      pytest: "pytest --version",
      local: "local-project-check",
      missing: "basics_compare_tool_that_does_not_exist",
      failing: `"${process.execPath.replaceAll("\\", "/")}" -e "process.exit(7)"`,
    };
    for (const [id, command] of Object.entries(commands))
      f.vault.writeNote(id, { type: "check", kind: "test", applies_to: ["react"], command, tags: [], source: "manual" }, "");
    const react = f.vault.get("react")!;
    assert.ok(react.data.type === "tech");
    f.vault.writeNote("react", { ...react.data, checks: Object.keys(commands) }, "");
    const globalRuff = path.join(f.bin, process.platform === "win32" ? "ruff.cmd" : "ruff");
    fs.writeFileSync(globalRuff, process.platform === "win32" ? "@echo off\r\nexit /b 9\r\n" : "#!/bin/sh\nexit 9\n");
    if (process.platform !== "win32") fs.chmodSync(globalRuff, 0o755);
    for (const venv of [".venv", "venv"]) {
      const report = await runComparison(
        f.vault,
        { agent: "claude", task: "dashboard", yes: true, trustChecks: true },
        { ...f.deps, env: { ...f.deps.env, FAKE_COMPARE_MODE: "tools", FAKE_COMPARE_VENV: venv } },
      );
      for (const result of report.results) {
        const statuses = Object.fromEntries(result.checks.map((check) => [check.id, check.status]));
        assert.deepEqual(statuses, {
          verify: "pass",
          mypy: "pass",
          pytest: "pass",
          local: "pass",
          missing: "missing_tool",
          failing: "fail",
        });
        assert.equal(result.checks_passed, 4);
      }
    }
  } finally {
    f.cleanup();
  }
});

test("file changes exclude runtime/cache/build artifacts and egg-info files without hiding source edits", () => {
  const f = fixture();
  try {
    const root = path.join(f.base, "output");
    fs.mkdirSync(root);
    const excluded = [
      ".mypy_cache",
      ".pytest_cache",
      ".ruff_cache",
      "__pycache__",
      "project.egg-info",
      ".venv",
      "venv",
      "node_modules",
      "target",
      "dist",
      "build",
      ".next",
      "coverage",
    ];
    for (const dir of excluded) {
      fs.mkdirSync(path.join(root, dir));
      fs.writeFileSync(path.join(root, dir, "entry"), "before");
    }
    fs.writeFileSync(path.join(root, "legacy.egg-info"), "metadata");
    fs.writeFileSync(path.join(root, "main.py"), "before");
    const before = snapshotFiles(root);
    for (const dir of excluded) fs.writeFileSync(path.join(root, dir, "entry"), "after");
    fs.writeFileSync(path.join(root, "main.py"), "after");
    fs.writeFileSync(path.join(root, "README.md"), "source");
    const diff = fileChanges(before, snapshotFiles(root));
    assert.deepEqual(diff.added, ["README.md"]);
    assert.deepEqual(diff.changed, ["main.py"]);
    assert.deepEqual(diff.deleted, []);
    assert.deepEqual(diff.excluded.sort(), [...excluded, "legacy.egg-info"].sort());
  } finally {
    f.cleanup();
  }
});

test("planner and compare-owned roots disappear after synchronous setup/spawn errors, completion and timeout", {
  timeout: 60_000,
}, async () => {
  const f = fixture(),
    created: string[] = [];
  const owned = new CompareDirectories();
  const options = {
    resolveExe: f.deps.resolveExe,
    env: f.deps.env,
    prepare: (dir: string) => {
      created.push(dir);
      owned.own(dir);
      return {};
    },
  };
  try {
    assert.throws(
      () =>
        new AgentRunner(options).start(
          { agent: "claude", prompt: "invalid\0prompt" },
          { onChunk: () => {}, onDone: () => assert.fail("spawn must reject synchronously") },
        ),
      /null bytes|argument/i,
    );
    assert.ok(
      created.every((dir) => !fs.existsSync(dir)),
      "spawn validation must remove even its empty owned root",
    );
    for (const mode of ["normal", "sleep", "missing"]) {
      const runner = new AgentRunner({
        ...options,
        timeoutMs: mode === "sleep" ? 150 : 5000,
        resolveExe: mode === "missing" ? () => path.join(f.bin, "missing-executable.exe") : options.resolveExe,
        env: { ...f.deps.env, FAKE_COMPARE_MODE: mode },
      });
      const result = await new Promise<{ ok: boolean }>((resolve) =>
        runner.start({ agent: "claude", prompt: "dashboard" }, { onChunk: () => {}, onDone: (_id, result) => resolve(result) }),
      );
      assert.equal(result.ok, mode === "normal");
      assert.ok(
        created.every((dir) => !fs.existsSync(dir)),
        `${mode} must remove the root itself, not only its contents`,
      );
    }
  } finally {
    for (const dir of created) owned.remove(dir);
    f.cleanup();
  }
});

test("expected stack excludes score-zero and language/history-only layers", () => {
  const candidate = (id: string, score: number, keyword: number, language = 0, history = 0): Candidate => ({
    id,
    kind: "framework",
    score,
    matched_use_when: [],
    matched_performs_best: [],
    matched_avoid_when: [],
    negated_use_when: [],
    negated_avoid_when: [],
    language_boost: language,
    score_breakdown: { keywords: keyword, text: 0, synonyms: 0, negation: 0, language, history },
  });
  const advice: Recommendation = {
    description: "task",
    mode: "keywords",
    profiles: [],
    note: "",
    layers: {
      zero: [candidate("zero", 0, 0)],
      language: [candidate("language", 3, 0, 3)],
      history: [candidate("history", 2, 0, 0, 2)],
      positive: [candidate("real", 5, 5)],
    },
  };
  assert.deepEqual(expectedCompareStack(advice), { positive: ["real"] });
});
test("CLI JSON output is a single report, planned count is separate, and --sample executes only the fake CLI", {
  timeout: 60_000,
}, async () => {
  const f = fixture();
  const config = path.join(f.base, "config.json");
  fs.writeFileSync(config, JSON.stringify({ vault: f.vault.root, language: "en", embeddings: false }));
  vi.stubEnv("BASICS_CONFIG", config);
  vi.stubEnv("PATH", f.bin);
  vi.stubEnv("HOME", f.authHome);
  vi.stubEnv("USERPROFILE", f.authHome);
  const output = vi.spyOn(console, "log").mockImplementation(() => {}),
    plan = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await buildProgram().parseAsync(["compare", "--sample", "rust-api/login-api", "--agent", "claude", "--yes", "--json"], {
      from: "user",
    });
    assert.equal(output.mock.calls.length, 1);
    const report = JSON.parse(String(output.mock.calls[0][0]));
    assert.equal(report.results.length, 3);
    assert.equal(report.sample, "rust-api/login-api");
    assert.match(String(plan.mock.calls[0][0]), /3 agent runs/);
    output.mockClear();
    await buildProgram().parseAsync(["compare", "dashboard", "--agent", "claude", "--yes", "--runs", "2"], { from: "user" });
    const text = output.mock.calls.map((call) => call.join(" ")).join("\n");
    assert.match(text, /used=react; recommended=react; match=yes/);
    assert.match(text, /files: added=3 changed=0 deleted=0/);
    assert.match(text, /tokens \(input \+ output, excluding cache\) mean=17 stddev=0/);
    assert.match(text, /verify=untrusted/);
    assert.match(text, /verify.cjs/);
    assert.match(text, /basics check .* --only verify --trust/);
    output.mockClear();
    await buildProgram().parseAsync(["compare", "dashboard", "--agent", "claude", "--yes", "--trust-checks", "--json"], { from: "user" });
    const trustedReport = JSON.parse(String(output.mock.calls[0][0]));
    assert.equal(trustedReport.trust_checks, true);
    assert.deepEqual(
      trustedReport.results.map((result: { checks_passed: number }) => result.checks_passed),
      [0, 1, 1],
    );
    assert.equal(fs.existsSync(path.join(f.vault.root, ".basics/trust.json")), false);
  } finally {
    output.mockRestore();
    plan.mockRestore();
    vi.unstubAllEnvs();
    f.cleanup();
  }
});
