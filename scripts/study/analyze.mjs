import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acceptanceMetrics } from "../../packages/core/dist/compare-api.js";
import { hash, json, readJson } from "./common.mjs";
import { bootstrapMean, describe, holm, wilcoxon } from "./stats.mjs";

export const metrics = [
  "acceptance_pass_rate",
  "fully_passing",
  "stack_match",
  "checks_passed",
  "wall_ms",
  "tokens_input",
  "tokens_output",
  "tokens_total",
  "cache_read",
  "cache_creation",
  "mcp_calls",
];
const primary = (baseline) => (baseline === "agents-md" ? metrics.slice(0, 4) : metrics.slice(0, 2));
function measurement(result, metric) {
  if (!result || result.contaminated) return null;
  const acceptance = acceptanceMetrics(result.acceptance);
  const value = {
    acceptance_pass_rate: acceptance.pass_rate,
    fully_passing: acceptance.all_passed === null ? null : Number(acceptance.all_passed),
    stack_match: result.stack_match,
    checks_passed: result.checks_passed,
    wall_ms: result.wall_ms,
    tokens_input: result.tokens?.input,
    tokens_output: result.tokens?.output,
    tokens_total: result.tokens?.total,
    cache_read: result.tokens?.cache_read,
    cache_creation: result.tokens?.cache_creation,
    mcp_calls: result.mcp_tool_calls?.total,
  }[metric];
  return Number.isFinite(value) ? value : null;
}
export function analyze(lock, records, { resamples = 10000 } = {}) {
  const keyed = new Map(),
    expected = new Map(lock.cells.map((cell) => [cell.id, cell]));
  for (const record of records) {
    const cell = expected.get(record.id);
    if (!cell || keyed.has(record.id) || record.lock_hash !== lock.hash || (record.result && record.result.condition !== cell.condition))
      throw new Error("Analysis records do not match locked study cells");
    if (record.reported_model && record.reported_model !== lock.config.agents[cell.agent].model)
      throw new Error("Reported model does not match the study pin");
    if (record.result?.reported_models?.some((model) => model !== lock.config.agents[cell.agent].model))
      throw new Error("Mixed reported models violate the study pin");
    if (record.cli_version && record.cli_version !== lock.metadata.agents[cell.agent].version)
      throw new Error("Reported CLI version differs from study pin");
    if (record.cell && hash(record.cell) !== hash(cell)) throw new Error("Analysis pairing identity mismatch");
    keyed.set(record.id, record);
  }
  const groups = [],
    comparisons = [];
  for (const agent of Object.keys(lock.config.agents).sort()) {
    for (const condition of ["none", "agents-md", "basics"]) {
      const cells = lock.cells.filter((cell) => cell.agent === agent && cell.condition === condition);
      const outcomes = cells.map((cell) => keyed.get(cell.id)?.result);
      const clean = outcomes.filter((result) => result && !result.contaminated);
      const calls = {};
      for (const result of clean)
        for (const [name, count] of Object.entries(result.mcp_tool_calls?.by_tool ?? {})) calls[name] = (calls[name] ?? 0) + count;
      groups.push({
        agent,
        condition,
        planned: cells.length,
        completed: outcomes.filter(Boolean).length,
        contaminated: outcomes.filter((result) => result?.contaminated).length,
        missing: cells.filter((cell) => !keyed.has(cell.id)).length,
        errors: clean.filter((result) => !result.ok || result.acceptance?.status === "error").length,
        timeouts: clean.filter((result) => result.timed_out).length,
        unconfirmed: clean.filter((result) => result.shutdown_confirmed === false).length,
        abandoned: cells.filter((cell) => keyed.get(cell.id)?.status === "abandoned").length,
        metrics: Object.fromEntries(
          metrics.map((metric) => [
            metric,
            describe(clean.flatMap((result) => (measurement(result, metric) === null ? [] : [measurement(result, metric)]))),
          ]),
        ),
        approved_checks: describe(
          clean.map(
            (result) => result.checks.filter((check) => check.command && !["untrusted", "missing_tool"].includes(check.status)).length,
          ),
        ),
        mcp_by_tool: calls,
        confirmed_all_pass_planned: {
          numerator: clean.filter((result) => acceptanceMetrics(result.acceptance).all_passed === true).length,
          denominator: cells.length - outcomes.filter((result) => result?.contaminated).length,
        },
        cost_micro_usd: cells.reduce((sum, cell) => sum + (keyed.get(cell.id)?.charged_micro_usd ?? 0), 0),
      });
    }
    for (const baseline of ["agents-md", "none"])
      for (const metric of metrics) {
        const differences = [],
          available = [];
        let incomplete = 0;
        for (const task of lock.tasks) {
          const repeats = [];
          for (let repeat = 1; repeat <= lock.config.repeats; repeat++) {
            const get = (condition) => {
              const cell = lock.cells.find(
                (value) => value.task === task.id && value.agent === agent && value.repeat === repeat && value.condition === condition,
              );
              return cell ? measurement(keyed.get(cell.id)?.result, metric) : null;
            };
            const basics = get("basics"),
              control = get(baseline);
            if (basics !== null && control !== null) repeats.push(basics - control);
          }
          if (repeats.length) available.push({ task: task.id, pairs: repeats.length, difference: describe(repeats).mean });
          if (repeats.length === lock.config.repeats) differences.push(describe(repeats).mean);
          else incomplete++;
        }
        const isPrimary = primary(baseline).includes(metric);
        comparisons.push({
          agent,
          baseline,
          metric,
          primary: isPrimary,
          tasks: differences.length,
          incomplete_tasks: incomplete,
          available_pairs: available,
          inference: differences.length ? wilcoxon(differences) : null,
          effect: bootstrapMean(differences, { seed: `${lock.config.seed}/${agent}/${baseline}/${metric}`, resamples }),
          adjusted_pvalue: null,
        });
      }
  }
  const family = comparisons.filter((value) => value.primary);
  if (family.length !== 12) throw new Error("Primary Holm family must contain 12 hypotheses");
  const adjusted = holm(family.map((value) => value.inference?.pvalue ?? null));
  family.forEach((value, index) => {
    value.adjusted_pvalue = adjusted[index];
  });
  return {
    schema_version: 1,
    lock_hash: lock.hash,
    seed: lock.config.seed,
    unit: "paired task means over all locked repeats",
    primary_family: 12,
    groups,
    comparisons,
    threats: [
      "No enforced filesystem isolation; unreported or indirect reads may evade contamination detection",
      "Task and vault author overlap; only two agents and a small selected task set",
      "Missing acceptance observations and incomplete pairs can bias measured-run estimates",
      "Wilcoxon assumes independent task differences symmetric under the null",
    ],
  };
}
export function loadRecords(output, lock) {
  const directory = fs.lstatSync(path.join(output, "runs"));
  if (directory.isSymbolicLink() || !directory.isDirectory()) throw new Error("Unsafe journal directory");
  return lock.cells.flatMap((cell) => {
    const file = path.join(output, "runs", `${cell.id}.jsonl`);
    if (!fs.existsSync(file)) return [];
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error("Unsafe journal file");
    const text = fs.readFileSync(file, "utf8");
    if (!text.endsWith("\n")) throw new Error("Interrupted JSONL needs reconciliation before analysis");
    const events = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    if (events.some((event) => event.id !== cell.id || event.lock_hash !== lock.hash || (event.cell && hash(event.cell) !== hash(cell))))
      throw new Error("Journal identity changed");
    if (events[0]?.event !== "started" || events.filter((event) => event.event === "started").length !== 1)
      throw new Error("Invalid run journal start");
    const terminal = events.filter((event) => ["finished", "abandoned"].includes(event.event));
    if (
      terminal.length > 2 ||
      (terminal.length === 2 &&
        !(terminal[0].event === "finished" && terminal[0].status === "unknown-cost" && terminal[1].event === "abandoned"))
    )
      throw new Error("Duplicate terminal run record");
    if (!terminal.length) throw new Error("Unresolved run reservation");
    const last = terminal.at(-1);
    if (!Number.isSafeInteger(last.charged_micro_usd) || last.charged_micro_usd < 0) throw new Error("Invalid journal charge");
    return [last];
  });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = path.resolve(process.argv[2]),
    lock = readJson(path.join(output, "study.lock.json"));
  const { hash: expected, ...body } = lock;
  if (hash(body) !== expected) throw new Error("Study lock hash mismatch");
  const result = analyze(lock, loadRecords(output, lock));
  fs.writeFileSync(path.join(output, "analysis.json"), json(result));
  console.log("agent condition measured mean_acceptance fully_passing stack_match checks tokens mcp contaminated");
  for (const group of result.groups)
    console.log(
      [
        group.agent,
        group.condition,
        group.metrics.acceptance_pass_rate?.count ?? 0,
        ...["acceptance_pass_rate", "fully_passing", "stack_match", "checks_passed", "tokens_total", "mcp_calls"].map(
          (metric) => group.metrics[metric]?.mean ?? "unavailable",
        ),
        group.contaminated,
      ].join(" "),
    );
}
