import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { spawnTarget } from "../../packages/basics/dist/agents.js";
import { loadRecords } from "./analyze.mjs";
import { buildBundles } from "./build-bundles.mjs";
import { buildStudyVault } from "./build-vault.mjs";
import { append, fresh, hash, inside, json, readJson, repoRoot, rng, studyRoot, treeHash, writeJson } from "./common.mjs";
import { configSchema, loadTasks, taskPrompt } from "./spec.mjs";

export function microUsd(value) {
  const amount = Math.round(value * 1e6);
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    (value > 0 && amount === 0) ||
    !Number.isSafeInteger(amount) ||
    Math.abs(amount / 1e6 - value) > 1e-9
  )
    throw new Error("USD amounts need safe micro-dollar precision");
  return amount;
}
export function estimatedCost(tokens, agent) {
  if (!tokens || tokens.total !== tokens.input + tokens.output) return null;
  let cost = 0;
  for (const [field, rate] of Object.entries(agent.prices)) {
    const count = tokens[field];
    if (field.startsWith("cache_") && agent.cache === "none") {
      if (count > 0) return null;
      continue;
    }
    if (!Number.isSafeInteger(count) || count < 0) return null;
    cost += count * rate;
  }
  return Number.isSafeInteger(Math.ceil(cost)) ? Math.ceil(cost) : null;
}
export function matrix(tasks, config) {
  const permutations = [
    ["none", "agents-md", "basics"],
    ["none", "basics", "agents-md"],
    ["agents-md", "none", "basics"],
    ["agents-md", "basics", "none"],
    ["basics", "none", "agents-md"],
    ["basics", "agents-md", "none"],
  ];
  const random = rng(config.seed),
    blocks = [];
  for (const agent of ["claude", "opencode"])
    for (const task of tasks) for (let repeat = 1; repeat <= config.repeats; repeat++) blocks.push({ task: task.id, agent, repeat });
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  }
  const sequence = { claude: 0, opencode: 0 };
  return blocks.flatMap((block) =>
    permutations[sequence[block.agent]++ % 6].map((condition) => ({
      ...block,
      condition,
      id: `${block.task}.${block.agent}.r${block.repeat}.${condition}`,
    })),
  );
}
const outputOf = (target, args) => {
  const resolved = spawnTarget(target.command);
  return execFileSync(resolved.command, [...resolved.prefix, ...target.prefix, ...args], {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 15000,
    env: { ...process.env, NO_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
};
function safeTarget(target) {
  if (
    !path.isAbsolute(target.command) ||
    inside(repoRoot, fs.realpathSync(target.command)) ||
    target.prefix.some((arg) => arg.replaceAll("\\", "/").toLowerCase().includes(repoRoot.replaceAll("\\", "/").toLowerCase()))
  )
    throw new Error("Real study tools must be external to the source checkout");
}
export function preflight(config) {
  if (process.env.BASICS_CONNECT_SERVER || process.env.BASICS_CONNECT_NODE)
    throw new Error("Clear MCP executable overrides before freezing a real study runtime");
  if (!config.runtime) throw new Error("Provide an installed external Basics runtime for real execution");
  const runtime = fs.realpathSync(config.runtime);
  if (inside(repoRoot, runtime)) throw new Error("Runtime must be outside the study checkout");
  const require = createRequire(path.join(runtime, "package.json"));
  const core = path.resolve(path.dirname(require.resolve("@marcozvd/basics-core")), "..");
  if (inside(repoRoot, fs.realpathSync(core))) throw new Error("Core runtime must not link into the source checkout");
  for (const [external, local] of [
    [path.join(runtime, "dist"), path.join(repoRoot, "packages/basics/dist")],
    [path.join(core, "dist"), path.join(repoRoot, "packages/core/dist")],
  ])
    if (treeHash(external) !== treeHash(local)) throw new Error("External runtime differs from this build");
  const toolchains = {};
  for (const name of ["node", "npm", "tsc", "python", "cargo", "rustc"]) {
    const target = config.toolchains[name];
    if (!target) throw new Error(`Missing verified toolchain: ${name}`);
    safeTarget(target);
    toolchains[name] = outputOf(target, ["--version"]);
  }
  const agents = {};
  for (const [id, agent] of Object.entries(config.agents)) {
    if (agent.cli.prefix.length) throw new Error("Agent CLI must be a directly spawnable executable or supported npm shim");
    safeTarget(agent.cli);
    const version = outputOf(agent.cli, ["--version"]);
    if (version !== agent.version) throw new Error(`Agent CLI version changed: ${id}`);
    agents[id] = { version, requested_model: agent.model };
  }
  const catalogue = outputOf(config.agents.opencode.cli, ["models", "tokenharbor1"]);
  if (
    !catalogue
      .split(/\r?\n/)
      .map((line) => line.trim())
      .includes(config.agents.opencode.model)
  )
    throw new Error("Pinned OpenCode model missing from configured catalogue");
  return {
    fake: false,
    os: os.platform(),
    arch: os.arch(),
    node: process.version,
    toolchains,
    agents,
    runtime_hash: hash({ basics: treeHash(path.join(runtime, "dist")), core: treeHash(path.join(core, "dist")) }),
  };
}
function sourceHash() {
  return treeHash(studyRoot);
}
export function createStudy(configInput, output, deps = {}) {
  const config = configSchema.parse(configInput);
  if (microUsd(config.reservation_usd) > microUsd(config.budget_usd)) throw new Error("Reservation exceeds batch budget");
  if (inside(repoRoot, output)) throw new Error("Study output must stay outside the source checkout");
  const metadata = (deps.preflight ?? preflight)(config);
  const tasks = loadTasks();
  fresh(output);
  fs.mkdirSync(path.join(output, "runs"));
  fs.mkdirSync(path.join(output, "projects"));
  fs.mkdirSync(path.join(output, "vaults"));
  const bundles = buildBundles(path.join(output, "bundles"), tasks);
  const vault = buildStudyVault(path.join(output, "master-vault"));
  const lock = {
    schema_version: 1,
    config,
    metadata,
    tasks,
    bundles: bundles.map(({ id, hash }) => ({ id, hash })),
    vault,
    source_hash: sourceHash(),
    cells: matrix(tasks, config),
    budget_note: "Scheduling cap with reservations, not a guaranteed provider billing ceiling",
  };
  lock.hash = hash(lock);
  writeJson(path.join(output, "study.lock.json"), lock);
  return lock;
}
function verify(output, lock, deps) {
  const { hash: expected, ...body } = lock;
  if (hash(body) !== expected || sourceHash() !== lock.source_hash)
    throw new Error("Study lock/source changed; create a new study identity");
  if (treeHash(path.join(output, "master-vault")) !== lock.vault.hash) throw new Error("Master vault changed");
  for (const bundle of lock.bundles)
    if (hash(fs.readFileSync(path.join(output, "bundles", `${bundle.id}.json`))) !== bundle.hash)
      throw new Error("Acceptance bundle changed");
  const metadata = (deps.preflight ?? preflight)(lock.config);
  if (hash(metadata) !== hash(lock.metadata)) throw new Error("Pinned environment/model/CLI metadata changed");
}
function acquire(output) {
  const file = path.join(output, ".runner.lock");
  if (fs.existsSync(file)) {
    const owner = readJson(file);
    if (!Number.isSafeInteger(owner.pid) || owner.pid < 2) throw new Error("Invalid runner ownership record");
    let alive = true;
    try {
      process.kill(owner.pid, 0);
    } catch (error) {
      if (error.code === "ESRCH") alive = false;
    }
    if (alive) throw new Error("Another runner owns this study");
    fs.unlinkSync(file);
  }
  writeJson(file, { pid: process.pid });
  return () => fs.unlinkSync(file);
}
export async function executeCell(lock, cell, output, signal) {
  const runtime = fs.realpathSync(lock.config.runtime),
    require = createRequire(path.join(runtime, "package.json"));
  const { Vault } = await import(pathToFileURL(require.resolve("@marcozvd/basics-core")).href);
  const { runComparison } = await import(pathToFileURL(path.join(runtime, "dist/compare.js")).href);
  const { publicCompareReport } = await import(pathToFileURL(path.join(runtime, "dist/server/compare.js")).href);
  const agent = lock.config.agents[cell.agent],
    toolchains = { ...lock.config.toolchains };
  if (toolchains.python) toolchains.python3 ??= toolchains.python;
  const env = { ...process.env, BASICS_STUDY_TOOLCHAINS: JSON.stringify(toolchains) };
  for (const [key, value] of Object.entries(env))
    if (typeof value === "string" && value.replaceAll("\\", "/").toLowerCase().includes(repoRoot.replaceAll("\\", "/").toLowerCase()))
      delete env[key];
  env.PATH = [...new Set(Object.values(toolchains).map((target) => path.dirname(target.command)))].join(path.delimiter);
  const agentCli = agent.cli;
  // T1 expects an executable path; prefixes are represented by a private Node shim.
  const executable = agentCli.command;
  if (agentCli.prefix.length) throw new Error("Real agent CLI must be a directly spawnable executable or supported npm shim");
  const vaultRoot = path.join(output, "vaults", cell.id);
  fs.cpSync(path.join(output, "master-vault"), vaultRoot, { recursive: true, errorOnExist: true, force: false });
  const report = await runComparison(
    Vault.load(vaultRoot),
    {
      agent: cell.agent,
      model: agent.model,
      task: taskPrompt(lock.tasks.find((task) => task.id === cell.task)),
      conditions: [cell.condition],
      runs: 1,
      timeoutMs: lock.config.timeout_ms,
      yes: true,
      trustChecks: true,
      keep: false,
      studyDir: repoRoot,
      acceptance: {
        bundle: path.join(output, "bundles", `${cell.task}.json`),
        command: `"${process.execPath.replaceAll("\\", "/")}" .basics-acceptance/run.mjs`,
      },
    },
    {
      packsDir: path.join(runtime, "dist/packs"),
      tempRoot: path.join(output, "projects"),
      env,
      resolveExe: () => executable,
      isTTY: false,
      signal,
    },
  );
  return publicCompareReport(report, env).results[0];
}
export async function runStudy(output, { execute = false, approveChecks = false, signal, ...deps } = {}) {
  const root = fs.lstatSync(output);
  if (root.isSymbolicLink() || !root.isDirectory()) throw new Error("Study output must be a regular directory");
  const lock = readJson(path.join(output, "study.lock.json"));
  verify(output, lock, deps);
  if (!execute || !approveChecks) throw new Error("Execution and acceptance/check approval must both be explicit");
  const release = acquire(output);
  try {
    const completed = loadRecords(output, lock),
      done = new Set(completed.map((record) => record.id));
    let charged = completed.reduce((sum, record) => sum + record.charged_micro_usd, 0);
    if (completed.some((record) => record.status === "unknown-cost"))
      return { status: "reconciliation-required", charged_micro_usd: charged };
    const reservation = microUsd(lock.config.reservation_usd),
      cap = microUsd(lock.config.budget_usd);
    for (const cell of lock.cells) {
      if (done.has(cell.id)) continue;
      if (signal?.aborted) return { status: "cancelled", charged_micro_usd: charged };
      if (charged + reservation > cap) return { status: "budget-exhausted", charged_micro_usd: charged };
      const file = path.join(output, "runs", `${cell.id}.jsonl`);
      append(file, {
        event: "started",
        id: cell.id,
        cell,
        lock_hash: lock.hash,
        reserved_micro_usd: reservation,
        at: new Date().toISOString(),
        requested_model: lock.config.agents[cell.agent].model,
        cli_version: lock.metadata.agents[cell.agent].version,
      });
      let result = null,
        error;
      try {
        result = await (deps.executeCell ?? executeCell)(lock, cell, output, signal);
      } catch (failure) {
        error = String(failure.message).replaceAll(repoRoot, "<study>").slice(0, 1000);
      }
      const cost = estimatedCost(result?.tokens, lock.config.agents[cell.agent]);
      const charge = cost ?? reservation;
      const mismatch =
        (result?.resolved_model && result.resolved_model !== lock.config.agents[cell.agent].model) ||
        result?.reported_models?.some((model) => model !== lock.config.agents[cell.agent].model);
      const status = mismatch ? "model-mismatch" : cost === null ? "unknown-cost" : error ? "error" : "completed";
      append(file, {
        event: "finished",
        id: cell.id,
        cell,
        lock_hash: lock.hash,
        at: new Date().toISOString(),
        requested_model: lock.config.agents[cell.agent].model,
        reported_model: result?.resolved_model ?? null,
        cli_version: lock.metadata.agents[cell.agent].version,
        status,
        error,
        result,
        estimated_micro_usd: cost,
        charged_micro_usd: charge,
        cost_basis: "locked token-equivalent rates; not an invoice",
      });
      charged += charge;
      if (status !== "completed" || charged > cap)
        return { status: status === "completed" ? "budget-overrun" : status, charged_micro_usd: charged };
    }
    return { status: "completed", charged_micro_usd: charged };
  } finally {
    release();
  }
}
/** Reconcile a crashed/unknown-cost cell as abandoned; never silently repeat an agent session. */
export function reconcile(output, id, usd) {
  const lock = readJson(path.join(output, "study.lock.json")),
    cell = lock.cells.find((value) => value.id === id);
  if (!cell) throw new Error("Unknown study cell");
  const release = acquire(output);
  try {
    const file = path.join(output, "runs", `${id}.jsonl`),
      text = fs.readFileSync(file, "utf8");
    if (!text.endsWith("\n")) throw new Error("Repair a truncated journal explicitly before reconciliation");
    const events = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    if (
      !events.some((event) => event.event === "started") ||
      events.some((event) => event.event === "abandoned" || (event.event === "finished" && event.status !== "unknown-cost"))
    )
      throw new Error("Only unresolved reservations can be reconciled");
    // Reconciliation is an auditable terminal replacement for a missing/unknown charge.
    const previous = events.find((event) => event.event === "finished");
    append(file, {
      event: "abandoned",
      id,
      cell,
      lock_hash: lock.hash,
      status: previous ? "reconciled" : "abandoned",
      result: previous?.result ?? null,
      requested_model: lock.config.agents[cell.agent].model,
      reported_model: previous?.reported_model ?? null,
      cli_version: lock.metadata.agents[cell.agent].version,
      charged_micro_usd: microUsd(usd),
      at: new Date().toISOString(),
    });
  } finally {
    release();
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      config: { type: "string" },
      output: { type: "string" },
      execute: { type: "boolean" },
      "approve-checks": { type: "boolean" },
      reconcile: { type: "string" },
      "charged-usd": { type: "string" },
    },
  });
  if (!values.output) throw new Error("--output is required; use a fresh directory outside the checkout");
  const output = path.resolve(values.output);
  if (values.reconcile) reconcile(output, values.reconcile, Number(values["charged-usd"]));
  else {
    if (!fs.existsSync(path.join(output, "study.lock.json"))) {
      if (!values.config) throw new Error("--config is required to prepare a study");
      createStudy(readJson(path.resolve(values.config)), output);
    } else if (
      values.config &&
      hash(configSchema.parse(readJson(path.resolve(values.config)))) !== hash(readJson(path.join(output, "study.lock.json")).config)
    )
      throw new Error("Resume configuration differs from the frozen lock");
    if (values.execute) {
      const abort = new AbortController();
      const stop = () => abort.abort();
      process.once("SIGINT", stop);
      try {
        console.log(
          json(await runStudy(output, { execute: true, approveChecks: values["approve-checks"] === true, signal: abort.signal })),
        );
      } finally {
        process.removeListener("SIGINT", stop);
      }
    } else console.log(`Prepared locked study: ${output}`);
  }
}
