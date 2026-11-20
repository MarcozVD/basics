import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type CompareState, Vault } from "@marcozvd/basics-core";
import { test, vi } from "vitest";
import { CompareDirectories } from "../src/compare-files.js";
import { createApp } from "../src/server/app.js";

const headers = { host: "localhost:4820", "content-type": "application/json" };
function fixture(mode?: string) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "basics-compare-api-"));
  const owner = new CompareDirectories();
  owner.own(base);
  const root = path.join(base, "vault"),
    runs = path.join(base, "runs"),
    bin = path.join(base, "bin"),
    authHome = path.join(base, "auth");
  for (const dir of [root, runs, bin, authHome]) fs.mkdirSync(dir);
  const config = path.join(base, "config.json");
  fs.writeFileSync(config, JSON.stringify({ vault: root, language: "en", embeddings: false }));
  vi.stubEnv("BASICS_CONFIG", config);
  const vault = Vault.load(root);
  vault.writeNote("frontend", { type: "layer", tags: [], source: "manual" }, "");
  vault.writeNote(
    "react",
    {
      type: "tech",
      kind: "framework",
      layer: "frontend",
      use_when: ["dashboard"],
      checks: ["verify"],
      packages: { npm: ["react"] },
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
      command: `"${process.execPath.replaceAll("\\", "/")}" verify.cjs`,
      applies_to: ["react"],
      tags: [],
      source: "manual",
    },
    "",
  );
  const script = path.join(bin, "fake.cjs");
  fs.copyFileSync(path.join(import.meta.dirname, "fixtures/compare-agent.cjs"), script);
  const exe = path.join(bin, process.platform === "win32" ? "claude.cmd" : "claude");
  fs.writeFileSync(
    exe,
    process.platform === "win32"
      ? `@echo off\r\n"%~dp0\\node.exe" "${script}" %*\r\n`
      : `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`,
  );
  if (process.platform !== "win32") fs.chmodSync(exe, 0o755);
  const closes: (() => Promise<void>)[] = [];
  const app = createApp({
    root,
    onClose: (fn) => closes.push(fn),
    compare: {
      packsDir: path.resolve(import.meta.dirname, "../../../packs"),
      tempRoot: runs,
      authHome,
      resolveExe: () => exe,
      env: { ...process.env, PATH: bin, FAKE_COMPARE_MODE: mode, FAKE_COMPARE_SECRET_TOKEN: "private-test-secret" },
    },
  });
  const post = (route: string, body: unknown) =>
    app.request(`/api/compare/${route}`, { method: "POST", headers, body: JSON.stringify(body) });
  const get = (route: string) => app.request(`/api/compare/${route}`, { headers });
  const plan = async () => {
    const response = await post("plan", { task: "dashboard", agent: "claude", runs: 1, timeoutMs: 5000 });
    assert.equal(response.status, 200);
    return response.json() as Promise<{ id: string; run_count: number; checks: { command: string }[] }>;
  };
  return {
    base,
    root,
    runs,
    vault,
    app,
    post,
    get,
    plan,
    cleanup: async () => {
      for (const close of closes) await close();
      vi.unstubAllEnvs();
      owner.remove(base);
    },
  };
}
async function done(f: ReturnType<typeof fixture>) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const state = (await (await f.get("state")).json()) as CompareState;
    if (state && !state.active) return state;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("comparison did not settle");
}

test("compare API validates plan/confirmation, streams every phase, reuses fake runner and safely opens/deletes history", {
  timeout: 60_000,
}, async () => {
  const f = fixture();
  try {
    assert.equal((await f.post("plan", { agent: "claude", runs: 0, timeoutMs: 5000 })).status, 400);
    const plan = await f.plan();
    assert.equal(plan.run_count, 2);
    assert.match(plan.checks[0].command, /verify.cjs/);
    assert.equal((await f.post("run", { plan: plan.id, confirmed: false })).status, 400);
    assert.equal((await f.post("run", { plan: plan.id, confirmed: true, approveChecks: true })).status, 202);
    const stream = await f.get("events");
    assert.match(stream.headers.get("content-type")!, /text\/event-stream/);
    const reader = stream.body!.getReader();
    let output = "";
    const consume = (async () => {
      while (!output.includes('"active":false')) {
        const next = await reader.read();
        if (next.done) break;
        output += new TextDecoder().decode(next.value);
      }
    })();
    const state = await done(f);
    await consume;
    await reader.cancel();
    for (const phase of ["planned", "running", "checks", "condition-finished", "finished"])
      assert.ok(output.includes(`"phase":"${phase}"`), phase);
    assert.deepEqual(
      state.report?.results.map((r) => r.checks_passed),
      [0, 1],
    );
    assert.deepEqual(fs.readdirSync(f.runs), []);
    assert.equal(fs.existsSync(path.join(f.root, ".basics/trust.json")), false);
    assert.equal(JSON.stringify(state).includes("private-test-secret"), false);
    assert.equal("file" in state.report!, false);
    const history = (await (await f.get("history")).json()) as { id: string }[];
    assert.equal(history.length, 1);
    assert.equal((await f.get(`history/${history[0].id}`)).status, 200);
    const reportFile = path.join(f.root, ".basics/compare", `${history[0].id}.json`);
    const stored = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    stored.env = { FAKE_COMPARE_SECRET_TOKEN: "private-test-secret" };
    stored.results[0].output = "private-test-secret";
    stored.results[0].error = 'Could not start "C:\\Program Files\\Claude\\claude.exe" from /private/agent/work';
    stored.results[0].cleanup_errors = ['Could not remove "C:\\Users\\private\\project"'];
    stored.results[0].checks[0].status = "untrusted";
    stored.results[0].checks[0].hint = `basics check "${f.runs}/legacy-workspace/project" --trust`;
    fs.writeFileSync(reportFile, JSON.stringify(stored));
    const publicResult = await (await f.get(`history/${history[0].id}`)).json();
    assert.equal("env" in publicResult, false);
    assert.equal(JSON.stringify(publicResult).includes("private-test-secret"), false);
    assert.equal(publicResult.results[0].output, "[redacted]");
    assert.match(publicResult.results[0].error, /^claude: /);
    assert.doesNotMatch(publicResult.results[0].error, /[A-Za-z]:[\\/]|\/private\//);
    assert.match(publicResult.results[0].cleanup_errors[0], /^claude: /);
    assert.doesNotMatch(publicResult.results[0].cleanup_errors[0], /[A-Za-z]:[\\/]/);
    assert.match(publicResult.results[0].checks[0].hint, /basics check <project>/);
    assert.ok(!publicResult.results[0].checks[0].hint.includes(f.runs));
    assert.doesNotMatch(publicResult.results[0].checks[0].hint, /[A-Za-z]:[\\/]|\/(?:tmp|private|var|Users|home)\//);
    assert.equal(JSON.parse(fs.readFileSync(reportFile, "utf8")).results[0].checks[0].hint, stored.results[0].checks[0].hint);
    const sentinel = path.join(f.root, "sentinel.json");
    fs.writeFileSync(sentinel, "keep");
    assert.equal((await f.app.request("/api/compare/history/%2e%2e%2fsentinel", { method: "DELETE", headers })).status, 404);
    const link = path.join(f.root, ".basics/compare/linked.json");
    fs.symlinkSync(f.base, link, process.platform === "win32" ? "junction" : "dir");
    assert.equal((await f.app.request("/api/compare/history/linked", { method: "DELETE", headers })).status, 404);
    assert.equal((await f.app.request(`/api/compare/history/${history[0].id}`, { method: "DELETE", headers })).status, 204);
    assert.equal(fs.readFileSync(sentinel, "utf8"), "keep");
    assert.equal((await f.get(`history/${history[0].id}`)).status, 404);
  } finally {
    await f.cleanup();
  }
});

test("single-run lock includes cancellation/cleanup, cancel stops fake process tree and default checks are untrusted", {
  timeout: 60_000,
}, async () => {
  const f = fixture("sleep");
  try {
    const plan = await f.plan();
    await f.post("run", { plan: plan.id, confirmed: true });
    assert.equal((await f.post("run", { plan: plan.id, confirmed: true })).status, 409);
    assert.equal((await f.post("plan", { task: "dashboard", agent: "claude", runs: 1, timeoutMs: 5000 })).status, 409);
    assert.equal((await f.post("cancel", { id: "wrong" })).status, 404);
    assert.equal((await f.post("cancel", { id: plan.id })).status, 200);
    const cancelled = await done(f);
    assert.equal(cancelled.progress.phase, "cancelled");
    assert.equal(cancelled.report?.cancelled, true);
    assert.deepEqual(fs.readdirSync(f.runs), []);
    assert.equal((await f.post("cancel", { id: plan.id })).status, 404);
  } finally {
    await f.cleanup();
  }
  const next = fixture();
  try {
    const plan = await next.plan();
    await next.post("run", { plan: plan.id, confirmed: true });
    assert.ok((await done(next)).report?.results.every((r) => r.checks[0].status === "untrusted" && r.checks_passed === 0));
  } finally {
    await next.cleanup();
  }
});

test("changed commands require a new plan and remote origins cannot launch comparisons", async () => {
  const f = fixture();
  try {
    const plan = await f.plan();
    const check = f.vault.get("verify")!;
    assert.ok(check.data.type === "check");
    f.vault.writeNote("verify", { ...check.data, command: "echo changed" }, "");
    assert.equal((await f.post("run", { plan: plan.id, confirmed: true, approveChecks: true })).status, 409);
    assert.equal(
      (await f.app.request("/api/compare/run", { method: "POST", headers: { ...headers, origin: "https://example.com" }, body: "{}" }))
        .status,
      403,
    );
    assert.deepEqual(fs.readdirSync(f.runs), []);
  } finally {
    await f.cleanup();
  }
});

test("cancellation during checks kills the shell command and its child process before cleanup", { timeout: 60_000 }, async () => {
  const f = fixture("check-tree");
  let childPid: number | undefined;
  let checkPid: number | undefined;
  const alive = () => {
    if (!childPid) return false;
    try {
      process.kill(childPid, 0);
      // A reparented Linux zombie has already stopped; init may reap it slightly later.
      if (process.platform === "linux" && fs.readFileSync(`/proc/${childPid}/stat`, "utf8").includes(") Z")) return false;
      return true;
    } catch {
      return false;
    }
  };
  try {
    const plan = await f.plan();
    await f.post("run", { plan: plan.id, confirmed: true, approveChecks: true });
    const deadline = Date.now() + 20_000;
    while (!childPid && Date.now() < deadline) {
      const root = fs.readdirSync(f.runs)[0];
      const file = root && path.join(f.runs, root, "project/child-pid");
      if (file && fs.existsSync(file)) {
        checkPid = Number(fs.readFileSync(path.join(path.dirname(file), "check-pid"), "utf8"));
        childPid = Number(fs.readFileSync(file, "utf8"));
      } else await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(childPid);
    assert.equal(alive(), true);
    assert.equal((await f.post("cancel", { id: plan.id })).status, 200);
    const stopDeadline = Date.now() + 3000;
    while (alive() && Date.now() < stopDeadline) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(alive(), false, "check subprocess must stop, not only its output pipes");
    assert.deepEqual(fs.readdirSync(f.runs), []);
    assert.equal((await done(f)).report?.cancelled, true);
  } finally {
    // Even if the host denies taskkill /T, never leave this test's owned processes behind.
    for (const pid of [childPid, checkPid]) {
      if (!pid) continue;
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* Already stopped. */
      }
    }
    await f.cleanup();
  }
});
