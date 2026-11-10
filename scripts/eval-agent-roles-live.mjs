#!/usr/bin/env node
// Manual only. Invoked by eval-agent-roles.mjs --live; never launches agents on import.
import { execFileSync, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkContract, projectCode, SCENARIO } from "./agent-roles-fixture.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const TEAM = [
  { role: "orchestrator", client: "claude" },
  { role: "dev", client: "codex" },
  { role: "tester", client: "opencode" },
];

async function projectUrl() {
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  if (port < 4820) throw new Error("Allocated project port below 4820");
  return `http://127.0.0.1:${port}`;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function baseSha() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO, encoding: "utf8", windowsHide: true }).trim();
  } catch {
    return "unavailable";
  }
}

export function browserEnvironment(inherited) {
  if (inherited.PLAYWRIGHT_BROWSERS_PATH) return inherited;
  const cache =
    process.platform === "win32"
      ? (inherited.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"))
      : process.platform === "darwin"
        ? path.join(os.homedir(), "Library", "Caches")
        : (inherited.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"));
  return { ...inherited, PLAYWRIGHT_BROWSERS_PATH: path.join(cache, "ms-playwright") };
}

export function transcriptModels(stdout) {
  const models = new Set();
  const visit = (item) => {
    if (!item || typeof item !== "object") return;
    for (const [key, value] of Object.entries(item)) {
      if ((key === "model" || key === "modelID") && typeof value === "string") models.add(value);
      else if (value && typeof value === "object") visit(value);
    }
  };
  for (const line of stdout.split(/\r?\n/)) {
    try {
      visit(JSON.parse(line));
    } catch {
      /* Raw client lines have no model metadata. */
    }
  }
  return [...models];
}

export function playwrightEvidence(stdout) {
  try {
    const report = JSON.parse(stdout);
    const counts = `${report.stats.expected} passed, ${report.stats.unexpected} failed, ${report.stats.skipped} skipped`;
    const passed = new Set();
    const failed = new Set();
    const visit = (suite) => {
      for (const spec of suite.specs ?? [])
        for (const test of spec.tests ?? []) {
          if (test.status === "expected" && test.results?.length && test.results.every((result) => result.status === "passed"))
            passed.add(test.projectName);
          else failed.add(test.projectName);
        }
      for (const child of suite.suites ?? []) visit(child);
    };
    for (const suite of report.suites ?? []) visit(suite);
    const browsers =
      report.stats.unexpected === 0 && report.stats.skipped === 0 && report.stats.expected > 0
        ? ["chromium", "firefox"].filter((browser) => passed.has(browser) && !failed.has(browser))
        : [];
    return { counts, browsers };
  } catch {
    return { counts: "invalid Playwright report", browsers: [] };
  }
}

function acceptedFiles(dir, base = dir) {
  const files = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".basics" || entry.name === "inbox") continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(files, acceptedFiles(file, base));
    else files[path.relative(base, file).split(path.sep).join("/")] = fs.readFileSync(file, "utf8");
  }
  return files;
}

export { projectCode as projectFiles };

export function isolatedEnvironment(home, inherited = process.env) {
  const env = { ...inherited };
  // Keep explicitly supplied provider keys, but never read/copy the user's config or login files.
  for (const key of ["CLAUDE_CONFIG_DIR", "CODEX_HOME", "OPENCODE_CONFIG", "OPENCODE_CONFIG_CONTENT", "NODE_OPTIONS"]) delete env[key];
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_STATE_HOME: path.join(home, ".local", "state"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    CLAUDE_CONFIG_DIR: path.join(home, ".claude"),
    CODEX_HOME: path.join(home, ".codex"),
    CODEX_API_KEY: inherited.OPENAI_API_KEY ?? "",
    OPENCODE_DISABLE_AUTOUPDATE: "true",
    CI: "1",
  });
  return env;
}

export function clientArguments(client, prompt, config) {
  if (client === "claude") {
    return [
      "-p",
      prompt,
      "--output-format",
      "stream-json",
      "--verbose",
      "--mcp-config",
      config,
      "--strict-mcp-config",
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      "Read",
      "Write",
      "Edit",
      "Bash",
      "Glob",
      "Grep",
      "mcp__basics__*",
    ];
  }
  if (client === "codex")
    return ["exec", prompt, "--json", "--skip-git-repo-check", "--sandbox", "workspace-write", "-c", 'approval_policy="never"'];
  return ["run", prompt, "--format", "json"];
}

async function executeProcess({ exe, args, cwd, env, timeoutMs = 600_000, logPrefix }) {
  const { spawnTarget } = await import("../packages/basics/dist/agents.js");
  const target = spawnTarget(exe);
  return new Promise((resolve) => {
    const child = spawn(target.command, [...target.prefix, ...args], {
      cwd,
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const out = [];
    const err = [];
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.once("error", (error) => err.push(Buffer.from(error.message)));
    child.once("close", (exitCode, signal) => {
      clearTimeout(timer);
      const stdout = Buffer.concat(out).toString("utf8");
      const stderr = Buffer.concat(err).toString("utf8");
      if (logPrefix) {
        fs.writeFileSync(`${logPrefix}.stdout.jsonl`, stdout);
        fs.writeFileSync(`${logPrefix}.stderr.txt`, stderr);
      }
      resolve({ exitCode, signal, stdout, stderr, timedOut });
    });
  });
}

async function preflight(env) {
  const missing = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "BASICS_EVAL_OPENCODE_MODEL"].filter((key) => !env[key]);
  if (missing.length)
    return `Isolated live eval requires explicit environment settings: ${missing.join(", ")}. No user login files are read.`;
  try {
    const { chromium, firefox } = require("@playwright/test");
    for (const browser of [chromium, firefox])
      if (!fs.existsSync(browser.executablePath()))
        return `Missing ${browser.name()} browser. Install with npx playwright install chromium firefox.`;
  } catch (error) {
    return `Playwright runtime unavailable: ${error.message}`;
  }
  return undefined;
}

export async function startCapture({ vault, calls, roleNow, nextSeq, observe, traceFile, runCheck }) {
  const { serve } = await import("@hono/node-server");
  const { createMcpServer } = await import("../packages/basics/dist/mcp/tools.js");
  const { WebStandardStreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js");
  const sessions = new Map();
  const fetch = async (request) => {
    const checkRoute = /^\/(dev|tester)\/check\/(typecheck|e2e)$/.exec(new URL(request.url).pathname);
    if (checkRoute) {
      if (request.method !== "POST" || checkRoute[1] !== roleNow() || !runCheck) return new Response("Not found", { status: 404 });
      return Response.json(await runCheck(checkRoute[2], checkRoute[1]));
    }
    const route = /^\/(orchestrator|dev|tester)\/mcp$/.exec(new URL(request.url).pathname);
    if (!route || route[1] !== roleNow()) return new Response("Not found", { status: 404 });
    const role = route[1];
    let body;
    if (request.method === "POST") {
      try {
        body = await request.clone().json();
      } catch {
        return new Response("Invalid JSON", { status: 400 });
      }
    }
    let session = sessions.get(request.headers.get("mcp-session-id"));
    if (!session) {
      if (body?.method !== "initialize") return new Response("Missing session", { status: 400 });
      const server = createMcpServer(() => vault);
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (id) => sessions.set(id, { server, transport, role }),
      });
      session = { server, transport, role };
      await server.connect(transport);
    }
    if (session.role !== role) return new Response("Wrong conversation", { status: 403 });
    observe();
    const seq = nextSeq();
    const startedAt = Date.now();
    const response = await session.transport.handleRequest(request);
    let envelope;
    if (response.headers.get("content-type")?.includes("application/json")) {
      try {
        envelope = await response.clone().json();
      } catch {
        /* Invalid replies remain visible in the raw trace. */
      }
    }
    const trace = { role, seq, startedAt, request: body, response: envelope, status: response.status };
    fs.appendFileSync(traceFile, `${JSON.stringify(trace)}\n`);
    if (body?.method === "tools/call")
      calls.push({
        role,
        seq,
        startedAt,
        name: body.params.name,
        arguments: body.params.arguments ?? {},
        result: envelope?.result ?? { isError: true, content: [] },
      });
    observe();
    return response;
  };
  let server;
  let port;
  for (port = 4820; port < 4920; port++) {
    try {
      server = serve({ fetch, port, hostname: "127.0.0.1" });
      await new Promise((resolve, reject) => {
        server.once("listening", resolve);
        server.once("error", reject);
      });
      break;
    } catch (error) {
      server?.close();
      if (error.code !== "EADDRINUSE") throw error;
    }
  }
  if (!server?.listening) throw new Error("No available eval port in 4820..4919");
  return {
    url: (role) => `http://127.0.0.1:${port}/${role}/mcp`,
    close: async () => {
      for (const session of sessions.values()) await session.server.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function configure(home, client, url, model, version) {
  fs.mkdirSync(home, { recursive: true });
  const env = isolatedEnvironment(home);
  for (const dir of [env.APPDATA, env.LOCALAPPDATA, env.XDG_CONFIG_HOME, env.CLAUDE_CONFIG_DIR, env.CODEX_HOME])
    fs.mkdirSync(dir, { recursive: true });
  const config = path.join(home, "mcp.json");
  if (client === "claude") writeJson(config, { mcpServers: { basics: { type: "http", url } } });
  if (client === "codex")
    fs.writeFileSync(path.join(env.CODEX_HOME, "config.toml"), `[mcp_servers.basics]\nurl = ${JSON.stringify(url)}\n`);
  if (client === "opencode") {
    env.OPENCODE_CONFIG = path.join(home, "opencode.json");
    writeJson(env.OPENCODE_CONFIG, {
      $schema: "https://opencode.ai/config.json",
      model,
      mcp: /^v?2\./.test(version)
        ? { servers: { basics: { type: "remote", url, oauth: false } } }
        : { basics: { type: "remote", url, enabled: true, oauth: false } },
      ...(/^v?2\./.test(version)
        ? {
            permissions: [
              { action: "*", resource: "*", effect: "allow" },
              { action: "edit", resource: "*", effect: "deny" },
            ],
          }
        : { permission: { "*": "allow", edit: "deny" } }),
    });
  }
  const skill =
    client === "claude"
      ? path.join(home, ".claude", "skills", "basics")
      : client === "codex"
        ? path.join(home, ".codex", "skills", "basics")
        : path.join(home, ".config", "opencode", "skills", "basics");
  fs.mkdirSync(skill, { recursive: true });
  fs.cpSync(path.join(REPO, "skills", "basics"), skill, { recursive: true });
  return { env, config, skill };
}

function installCheckWrapper(fixture, url) {
  fs.writeFileSync(
    path.join(fixture.project, "eval-check.mjs"),
    `
const kind = process.argv[2];
if (!['typecheck','e2e'].includes(kind)) throw new Error('Use typecheck or e2e');
const response = await fetch(${JSON.stringify(url.replace(/\/mcp$/, ""))} + '/check/' + kind, {method:'POST'});
if (!response.ok) throw new Error('Runner check failed: '+response.status);
const result = await response.json();
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
process.stdout.write(String.fromCharCode(10)+'BASICS_EVAL_CHECK '+JSON.stringify(result.check)+String.fromCharCode(10));
process.exitCode=result.check.exitCode;
`,
  );
}

export async function runObservedCheck({ fixture, role, kind, revision, env, contract, execute = executeProcess }) {
  if (!["dev", "tester"].includes(role) || !["typecheck", "e2e"].includes(kind)) throw new Error("Invalid runner check");
  const before = checkContract(fixture.project);
  const source = fs.readFileSync(path.join(fixture.project, "src/counter.tsx"), "utf8");
  const e2e = kind === "e2e";
  const unchanged = () => JSON.stringify(checkContract(fixture.project)) === JSON.stringify(contract);
  const check = {
    role,
    note: e2e ? "e2e-critical-flows" : "typescript-typecheck",
    command: e2e ? "npx playwright test" : "npx tsc --noEmit",
    origin: "runner",
    revision,
    artifact: createHash("sha256").update(source).digest("hex"),
    executed: false,
    exitCode: 1,
    counts: "check contract changed",
    evidence: path.join(fixture.root, `${role}-${kind}-${randomUUID()}.txt`),
  };
  let stdout = "";
  let stderr = "";
  if (JSON.stringify(before) === JSON.stringify(contract)) {
    const args = e2e
      ? [require.resolve("@playwright/test/cli"), "test", "--project", "chromium", "--project", "firefox"]
      : [require.resolve("typescript/bin/tsc"), "--noEmit"];
    const run = await execute({ exe: process.execPath, args, cwd: fixture.project, env, timeoutMs: 300_000 });
    stdout = run.stdout ?? "";
    stderr = run.stderr ?? "";
    check.executed = true;
    check.exitCode = run.exitCode ?? 1;
    if (e2e) Object.assign(check, playwrightEvidence(stdout));
    else check.counts = check.exitCode === 0 ? "0 errors" : "typecheck failed";
    if (!unchanged() || fs.readFileSync(path.join(fixture.project, "src/counter.tsx"), "utf8") !== source) {
      check.exitCode = 1;
      check.counts = "check contract or source changed during execution";
    }
    if (e2e && (!check.browsers?.includes("chromium") || !check.browsers?.includes("firefox"))) check.exitCode = 1;
  }
  check.completedAt = Date.now();
  fs.writeFileSync(check.evidence, stdout + String.fromCharCode(10) + stderr);
  return { check, stdout, stderr };
}

/** Dependencies let CI test orchestration and BLOCKED handling without launching a paid CLI. */
export async function runLive(options = {}) {
  let env = browserEnvironment(options.env ?? process.env);
  const execute = options.execute ?? executeProcess;
  const resolveExe = options.resolveExe ?? (async (client) => (await import("../packages/basics/dist/agents.js")).onPath(client));
  const executables = {};
  for (const { client } of TEAM) {
    executables[client] = await resolveExe(client);
    if (!executables[client]) return { status: "BLOCKED", reason: `${client} CLI unavailable on PATH`, exitCode: 2 };
  }
  const reason = await (options.preflight ?? preflight)(env);
  if (reason) return { status: "BLOCKED", reason, exitCode: 2 };
  const core = options.core ?? (await import("./eval-agent-roles.mjs"));
  const fixture = await (options.createFixture ?? core.createFixture)();
  const evidence = {
    mode: "live",
    calls: [],
    checks: [],
    exportedFiles: [],
    writtenFiles: {},
    edits: [],
    handoff: "",
    acceptedBefore: acceptedFiles(fixture.vault),
    checkContractBefore: checkContract(fixture.project),
  };
  const source = path.join(fixture.project, "src", "counter.tsx");
  evidence.sourceBefore = fs.readFileSync(source, "utf8");
  let previous = evidence.sourceBefore;
  let role = "orchestrator";
  let seq = 0;
  const observe = () => {
    const current = fs.readFileSync(source, "utf8");
    if (current !== previous) {
      evidence.edits.push({ role, seq: ++seq });
      previous = current;
    }
  };
  let capture;
  let watcher;
  const manifest = {
    runId: randomUUID(),
    baseSha: options.baseSha ?? baseSha(),
    scenario: SCENARIO,
    versions: {},
    transport: "streamable-http",
    trace: path.join(fixture.root, "mcp-trace.jsonl"),
    requestedModels: {
      claude: env.BASICS_EVAL_CLAUDE_MODEL ?? "client default",
      codex: env.BASICS_EVAL_CODEX_MODEL ?? "client default",
      opencode: env.BASICS_EVAL_OPENCODE_MODEL,
    },
    reportedModels: {},
    skillHash: createHash("sha256")
      .update(fs.readFileSync(path.join(REPO, "skills/basics/SKILL.md")))
      .digest("hex"),
    conversations: [],
  };
  try {
    env = { ...env, ROLE_EVAL_URL: options.projectUrl ?? (await projectUrl()) };
    capture = await (options.startCapture ?? startCapture)({
      vault: fixture.vault,
      calls: evidence.calls,
      roleNow: () => role,
      nextSeq: () => ++seq,
      observe,
      traceFile: path.join(fixture.root, "mcp-trace.jsonl"),
      runCheck: async (kind, checkRole) => {
        const result = await runObservedCheck({
          fixture,
          role: checkRole,
          kind,
          revision: manifest.baseSha,
          env,
          contract: evidence.checkContractBefore,
          execute: options.executeCheck ?? executeProcess,
        });
        evidence.checks.push(result.check);
        fs.appendFileSync(path.join(fixture.root, "check-trace.jsonl"), `${JSON.stringify(result.check)}\n`);
        return result;
      },
    });
    watcher = fs.watch(path.dirname(source), () => {
      try {
        observe();
      } catch {
        /* Phase snapshot reports missing files. */
      }
    });
    let output = "";
    for (const member of TEAM) {
      role = member.role;
      const home = path.join(fixture.root, "homes", member.client);
      const version = await execute({
        exe: executables[member.client],
        args: ["--version"],
        cwd: fixture.project,
        env: isolatedEnvironment(home, env),
        timeoutMs: 15_000,
      });
      if (version.exitCode !== 0)
        return { status: "BLOCKED", reason: `${member.client} version check failed`, exitCode: 2, artifacts: fixture.root };
      manifest.versions[member.client] = version.stdout.trim();
      const versionNumber = /\b(\d+\.\d+\.\d+)/.exec(version.stdout)?.[1] ?? "";
      const configured = configure(home, member.client, capture.url(role), env.BASICS_EVAL_OPENCODE_MODEL, versionNumber);
      configured.env = isolatedEnvironment(home, env);
      if (member.client === "opencode") configured.env.OPENCODE_CONFIG = path.join(home, "opencode.json");
      if (role !== "orchestrator") installCheckWrapper(fixture, capture.url(role));
      const prompt = `${SCENARIO}\nYou are the ${role} in this orchestrated team.\nWork only in ${fixture.project}. Load the Basics skill at ${configured.skill} and use the connected Basics MCP. The project stack is in basics.json.\nChecks run through the harness: node eval-check.mjs typecheck and node eval-check.mjs e2e. It executes the vault commands and records independent exit/output evidence outside the project.\nPrevious handoff:\n${output}`;
      const args = clientArguments(member.client, prompt, configured.config);
      if (member.client === "codex") args.push("--add-dir", fixture.root);
      if (member.client === "opencode" && versionNumber.startsWith("2.")) args.unshift("--standalone");
      const requestedModel =
        member.client === "claude" ? env.BASICS_EVAL_CLAUDE_MODEL : member.client === "codex" ? env.BASICS_EVAL_CODEX_MODEL : undefined;
      if (requestedModel) args.push("--model", requestedModel);
      const result = await execute({
        exe: executables[member.client],
        args,
        cwd: fixture.project,
        env: configured.env,
        timeoutMs: options.timeoutMs ?? 600_000,
        logPrefix: path.join(fixture.root, member.client),
      });
      manifest.conversations.push({ role, client: member.client, exitCode: result.exitCode });
      manifest.reportedModels[member.client] = transcriptModels(result.stdout);
      output = result.stdout;
      evidence.handoff += `\n${output}`;
      observe();
      if (
        result.timedOut ||
        result.exitCode !== 0 ||
        /(?:unauthori[sz]ed|authentication (?:failed|required)|not logged in|invalid api key|insufficient.*credits)/i.test(
          `${result.stdout}\n${result.stderr}`,
        )
      )
        return {
          status: "BLOCKED",
          reason: `${member.client} runtime/authentication failed; inspect saved transcript`,
          exitCode: 2,
          artifacts: fixture.root,
        };
      if (role === "orchestrator") {
        const call = evidence.calls.findLast((entry) => entry.role === role && entry.name === "export_project" && !entry.result.isError);
        const body = call?.result.content?.[0]?.text ?? "";
        try {
          evidence.exportedFiles = JSON.parse(body.slice(0, body.lastIndexOf("\n\nWrite these files")));
        } catch {
          /* Missing export fails the evaluator. */
        }
        for (const file of evidence.exportedFiles) {
          const target = path.resolve(fixture.project, file.path);
          if (!target.startsWith(`${path.resolve(fixture.project)}${path.sep}`)) throw new Error("Export escaped fixture project");
          if (fs.existsSync(target)) evidence.writtenFiles[file.path] = fs.readFileSync(target, "utf8");
        }
      }
      if (role === "dev") {
        evidence.sourceAfterDev = fs.readFileSync(source, "utf8");
        evidence.projectBeforeTester = projectCode(fixture.project);
      }
      if (role === "tester") {
        evidence.sourceAfterTester = fs.readFileSync(source, "utf8");
        evidence.projectAfterTester = projectCode(fixture.project);
      }
    }
    evidence.acceptedAfter = acceptedFiles(fixture.vault);
    evidence.checkContractAfter = checkContract(fixture.project);
    writeJson(path.join(fixture.root, "evidence.json"), evidence);
    if (!evidence.calls.length || !evidence.checks.length)
      return { status: "BLOCKED", reason: "Missing independently captured MCP or command evidence", exitCode: 2, artifacts: fixture.root };
    if (evidence.checks.some((check) => !check.evidence || !fs.existsSync(check.evidence)))
      return { status: "BLOCKED", reason: "Missing process output evidence file", exitCode: 2, artifacts: fixture.root };
    const result = await (options.evaluate ?? core.evaluateEvidence)(evidence);
    return { ...result, exitCode: result.status === "PASS" ? 0 : 1, artifacts: fixture.root };
  } catch (error) {
    return { status: "BLOCKED", reason: error.message, exitCode: 2, artifacts: fixture.root };
  } finally {
    watcher?.close();
    try {
      await capture?.close();
    } catch (error) {
      manifest.cleanupError = error.message;
    }
    manifest.artifactHashes = Object.fromEntries(
      ["sourceBefore", "sourceAfterDev", "sourceAfterTester"]
        .filter((key) => typeof evidence[key] === "string")
        .map((key) => [key, createHash("sha256").update(evidence[key]).digest("hex")]),
    );
    try {
      writeJson(path.join(fixture.root, "manifest.json"), manifest);
    } catch (error) {
      console.error(`Could not write live eval manifest: ${error.message}`);
    }
    // Retain transcripts/evidence for manual review. Only fixture.cleanup removes them.
  }
}
