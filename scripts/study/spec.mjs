import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { readJson, studyRoot } from "./common.mjs";

export const taskSchema = z.strictObject({
  id: z.string().regex(/^\d{2}-[a-z0-9-]+$/),
  title: z.string().min(1),
  interface: z.enum(["cli", "http"]),
  prompt: z.string().min(40),
});
export function loadTasks(directory = path.join(studyRoot, "tasks")) {
  const tasks = fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => taskSchema.parse(readJson(path.join(directory, name))));
  if (!tasks.length || new Set(tasks.map((task) => task.id)).size !== tasks.length) throw new Error("Study tasks must have unique IDs");
  return tasks;
}
export const contractPrompt = `Use any installed Node/TypeScript, Python or Rust runtime and any suitable framework. No external service is needed. Write study-run.json in the project root with only these fields: {"interface":"cli" or "http","build":[["tool","arg",...],...],"command":["tool-or-relative-executable","arg",...]}. Build is optional. Commands are argv arrays, never shell strings. Supported tools: node, npm, tsc, python, python3, py, cargo, rustc. A compiled executable may be a relative path inside the project. Declare all build steps needed after implementation; dependencies must already be available locally. CLI input is UTF-8 stdin and stdout must contain only the requested result. Diagnostics go to stderr. HTTP programs listen on 127.0.0.1 using the PORT environment variable. Keep all implementation files inside this project.`;
export const taskPrompt = (task) => `${task.prompt}\n\n${contractPrompt}`;

const target = z.strictObject({ command: z.string().min(1), prefix: z.array(z.string()).default([]) });
const prices = z.strictObject({
  input: z.number().finite().nonnegative(),
  output: z.number().finite().nonnegative(),
  cache_read: z.number().finite().nonnegative(),
  cache_creation: z.number().finite().nonnegative(),
});
const claudeAgent = z.strictObject({
  model: z.string().regex(/^claude-haiku-(?!.*(?:latest|default))[a-z0-9.-]+$/),
  cli: target,
  version: z.string().min(1),
  prices,
  cache: z.enum(["none", "reported"]),
});
const opencodeAgent = z.strictObject({
  model: z.literal("tokenharbor1/deepseek-v4.1-flash-1017"),
  cli: target,
  version: z.string().min(1),
  prices,
  cache: z.enum(["none", "reported"]),
});
/**
 * mode "study" is the frozen primary design: both agents, every task, at least 2 repeats.
 * mode "pilot" allows one agent, a task subset and one repeat for smoke runs; its lock and analysis are marked non-primary.
 */
export const configSchema = z
  .strictObject({
    mode: z.enum(["study", "pilot"]).default("study"),
    tasks: z
      .array(z.string().regex(/^\d{2}-[a-z0-9-]+$/))
      .min(1)
      .optional(),
    seed: z.string().min(1),
    repeats: z.number().int().min(1).max(10).default(2),
    timeout_ms: z.number().int().min(1000).max(2147483647).default(600000),
    budget_usd: z.number().finite().positive(),
    reservation_usd: z.number().finite().positive(),
    rates_at: z.string().datetime(),
    runtime: z.string().optional(),
    toolchains: z.record(z.string(), target),
    agents: z.strictObject({ claude: claudeAgent.optional(), opencode: opencodeAgent.optional() }),
  })
  .superRefine((config, ctx) => {
    const issue = (message) => ctx.addIssue({ code: "custom", message });
    if (!config.agents.claude && !config.agents.opencode) issue("At least one agent is required");
    if (config.tasks && new Set(config.tasks).size !== config.tasks.length) issue("Pilot tasks must be unique");
    if (config.mode === "study" && (!config.agents.claude || !config.agents.opencode || config.repeats < 2 || config.tasks))
      issue("A primary study needs both agents, every task and at least 2 repeats; use mode pilot for a smaller non-primary run");
  });
