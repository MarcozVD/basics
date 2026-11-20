import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  COMPARE_CONDITIONS,
  type CompareReport,
  type CompareState,
  loadConfig,
  normalizeCompareCondition,
  readPackTasks,
  type Vault,
} from "@marcozvd/basics-core";
import { acceptanceMetrics, summarizeAcceptance } from "@marcozvd/basics-core/compare";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { type CompareDependencies, compareErrorMessage, planComparison, runComparison, untrustedCheckHint } from "../compare.js";

const requestSchema = z
  .object({
    task: z.string().trim().min(1).max(20_000).optional(),
    sample: z.string().max(120).optional(),
    agent: z.enum(["claude", "opencode", "codex"]),
    model: z.string().trim().max(200).optional(),
    runs: z.number().int().min(1).max(10),
    conditions: z
      .array(z.enum(COMPARE_CONDITIONS))
      .min(1)
      .max(3)
      .refine((v) => new Set(v).size === v.length)
      .optional(),
    acceptance: z.strictObject({ bundle: z.string().min(1), command: z.string().trim().min(1) }).optional(),
    studyDir: z.string().min(1).optional(),
    timeoutMs: z.number().int().min(1000).max(3_600_000),
  })
  .strict()
  .refine((value) => Boolean(value.task) !== Boolean(value.sample), "provide a task or a sample, not both");

/** Only public metrics/output, never runner environment, control paths or credentials. */
export function publicCompareReport(report: CompareReport, env: NodeJS.ProcessEnv = process.env): CompareReport {
  const secrets = Object.entries(env).flatMap(([key, value]) =>
    /token|key|secret|password|credential|auth/i.test(key) && value && value.length >= 4 ? [value] : [],
  );
  const clean = (value: unknown): unknown => {
    if (typeof value === "string") {
      for (const secret of secrets) value = (value as string).replaceAll(secret, "[redacted]");
      return value;
    }
    if (Array.isArray(value)) return value.map(clean);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clean(entry)]));
    return value;
  };
  return clean({
    schema_version: report.schema_version,
    conditions: report.conditions ?? [...new Set(report.results.map((r) => normalizeCompareCondition(r.condition)))],
    validity_note: report.validity_note,
    id: report.id,
    at: report.at,
    task: report.task,
    sample: report.sample,
    agent: report.agent,
    model: report.model,
    runs: report.runs,
    timeout_ms: report.timeout_ms,
    trust_checks: report.trust_checks,
    recorded: report.recorded,
    cancelled: report.cancelled,
    recommendation: report.recommendation,
    summary: Object.fromEntries(
      Object.entries(report.summary).map(([condition, value]) => [
        normalizeCompareCondition(condition as Parameters<typeof normalizeCompareCondition>[0]),
        {
          ...value,
          ...summarizeAcceptance(
            report.results.filter(
              (r) =>
                normalizeCompareCondition(r.condition) ===
                normalizeCompareCondition(condition as Parameters<typeof normalizeCompareCondition>[0]),
            ),
          ),
        },
      ]),
    ),
    results: report.results.map((r) => ({
      run: r.run,
      condition: normalizeCompareCondition(r.condition),
      mcp_tool_calls: r.mcp_tool_calls ?? null,
      acceptance: r.acceptance ? { ...r.acceptance, ...acceptanceMetrics(r.acceptance) } : null,
      contaminated: r.contaminated ?? false,
      contamination_reasons: r.contamination_reasons ?? [],
      shutdown_confirmed: r.shutdown_confirmed,
      ok: r.ok,
      error: compareErrorMessage(r.error, report.agent),
      timed_out: r.timed_out,
      wall_ms: r.wall_ms,
      tokens: r.tokens,
      stack_used: r.stack_used,
      stack_comparison: r.stack_comparison,
      stack_match: r.stack_match,
      checks: r.checks.map((check) =>
        check.status === "untrusted"
          ? {
              ...check,
              hint: untrustedCheckHint(Object.values(report.recommendation).flat(), check.id),
            }
          : check,
      ),
      checks_passed: r.checks_passed,
      files: r.files,
      output: r.output.slice(0, 3000),
      cleanup_errors: r.cleanup_errors.map((error) => compareErrorMessage(error, report.agent) ?? ""),
    })),
  }) as CompareReport;
}

export function createCompareApi(vault: () => Vault, deps: CompareDependencies) {
  const app = new Hono();
  const subscribers = new Set<(state: CompareState) => void>();
  const streamStops = new Set<() => void>();
  let state: CompareState | undefined;
  let journal: CompareState[] = [];
  let active: { abort: AbortController; done: Promise<void> } | undefined;
  let pending: { id: string; at: number; options: z.infer<typeof requestSchema> & { language: string }; fingerprint: string } | undefined;
  const publish = (next: CompareState) => {
    state = next;
    journal.push(next);
    if (journal.length > 500) journal.shift();
    for (const listener of subscribers) listener(next);
  };
  const storage = () => {
    const root = vault().root;
    for (const relative of [".basics", ".basics/compare"]) {
      const file = path.join(root, relative);
      try {
        const stat = fs.lstatSync(file);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error("unsafe compare history directory");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return path.join(root, ".basics/compare");
  };
  const historyFile = (id: string) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/.test(id) || id.includes("..")) return;
    const file = path.join(storage(), `${id}.json`);
    try {
      if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) return;
    } catch {
      return;
    }
    return file;
  };
  const read = (id: string) => {
    const file = historyFile(id);
    if (!file || fs.statSync(file).size > 10 * 1024 * 1024) return;
    try {
      const report = JSON.parse(fs.readFileSync(file, "utf8")) as CompareReport;
      if (report.id !== id || !Array.isArray(report.results) || !report.summary) return;
      return publicCompareReport(report, deps.env);
    } catch {
      return;
    }
  };
  app.get("/samples", (c) => {
    const samples = fs
      .readdirSync(deps.packsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => readPackTasks(deps.packsDir, entry.name).map((task) => ({ ...task, sample: `${entry.name}/${task.id}` })));
    return c.json(samples);
  });
  app.post("/plan", async (c) => {
    if (active) return c.json({ error: "busy", message: "a comparison is already running" }, 409);
    const options = { ...requestSchema.parse(await c.req.json()), language: loadConfig().language };
    let plan: ReturnType<typeof planComparison>;
    try {
      plan = planComparison(vault(), options, deps);
    } catch {
      return c.json({ error: "invalid", message: "provide a valid task or pack sample" }, 400);
    }
    const id = randomUUID();
    pending = { id, at: Date.now(), options, fingerprint: JSON.stringify(plan.commands) };
    return c.json({ id, task: plan.task.prompt, run_count: plan.runs * plan.conditions.length, checks: plan.commands });
  });
  app.post("/run", async (c) => {
    const body = z
      .object({ plan: z.string(), confirmed: z.literal(true), approveChecks: z.boolean().default(false) })
      .strict()
      .parse(await c.req.json());
    if (active) return c.json({ error: "busy", message: "a comparison is already running" }, 409);
    const plan = pending;
    if (!plan || plan.id !== body.plan || Date.now() - plan.at > 5 * 60_000)
      return c.json({ error: "expired", message: "prepare the comparison again" }, 409);
    const current = vault();
    if (JSON.stringify(planComparison(current, plan.options, deps).commands) !== plan.fingerprint)
      return c.json({ error: "changed", message: "check commands changed; review the plan again" }, 409);
    pending = undefined;
    const abort = new AbortController();
    journal = [];
    publish({ id: plan.id, active: true, progress: { phase: "planned" } });
    // Defer work until the single-run lock is installed and the POST can return.
    const done = Promise.resolve().then(async () => {
      try {
        const report = await runComparison(
          current,
          { ...plan.options, yes: true, keep: false, trustChecks: body.approveChecks },
          {
            ...deps,
            isTTY: false,
            signal: abort.signal,
            progress: (progress) => publish({ id: plan.id, active: true, progress }),
          },
        );
        publish({
          id: plan.id,
          active: false,
          progress: { phase: abort.signal.aborted ? "cancelled" : "finished" },
          report: publicCompareReport(report, deps.env),
        });
      } catch {
        publish({
          id: plan.id,
          active: false,
          progress: { phase: abort.signal.aborted ? "cancelled" : "error" },
          error: "comparison failed; check the installed agent and try again",
        });
      } finally {
        active = undefined;
      }
    });
    active = { abort, done };
    return c.json({ id: plan.id }, 202);
  });
  app.get("/state", (c) => c.json(state ?? null));
  app.post("/cancel", async (c) => {
    const body = z
      .object({ id: z.string() })
      .strict()
      .parse(await c.req.json());
    if (!active || state?.id !== body.id) return c.json({ error: "not_found", message: "no such active comparison" }, 404);
    active.abort.abort();
    await active.done;
    return c.json({ cancelled: true });
  });
  app.get("/events", (c) =>
    streamSSE(c, async (stream) => {
      const send = (value: CompareState) => {
        void stream.writeSSE({ event: "compare", data: JSON.stringify(value) });
      };
      subscribers.add(send);
      for (const entry of journal) send(entry);
      const heartbeat = setInterval(() => {
        void stream.writeSSE({ event: "ping", data: "{}" });
      }, 15_000);
      try {
        await new Promise<void>((resolve) => {
          streamStops.add(resolve);
          stream.onAbort(() => {
            streamStops.delete(resolve);
            resolve();
          });
        });
      } finally {
        clearInterval(heartbeat);
        subscribers.delete(send);
      }
    }),
  );
  app.get("/history", (c) => {
    const dir = storage();
    const reports = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((name) => name.endsWith(".json"))
          .sort()
          .reverse()
          .slice(0, 200)
          .flatMap((name) => {
            try {
              const report = read(name.slice(0, -5));
              return report ? [{ id: report.id, at: report.at, task: report.task, agent: report.agent, model: report.model }] : [];
            } catch {
              return [];
            }
          })
      : [];
    return c.json(reports);
  });
  app.get("/history/:id", (c) => {
    const report = read(c.req.param("id"));
    return report ? c.json(report) : c.json({ error: "not_found", message: "no such comparison" }, 404);
  });
  app.delete("/history/:id", (c) => {
    const file = historyFile(c.req.param("id"));
    if (!file) return c.json({ error: "not_found", message: "no such comparison" }, 404);
    fs.unlinkSync(file);
    if (state?.report?.id === c.req.param("id")) publish({ ...state, report: undefined });
    return c.body(null, 204);
  });
  return {
    app,
    close: async () => {
      if (active) {
        active.abort.abort();
        await active.done;
      }
      for (const stop of streamStops) stop();
      streamStops.clear();
    },
  };
}
