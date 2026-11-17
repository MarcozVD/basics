import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { readPack } from "./packs.js";

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const localized = z.record(z.string(), z.string().trim().min(1));
const taskSchema = z.strictObject({
  id,
  title: localized,
  prompt: localized,
  expected_layers: z.array(id).min(1),
});
const tasksSchema = z.strictObject({ schema_version: z.literal(1), tasks: z.array(taskSchema).min(1) });

export type PackTask = z.infer<typeof taskSchema>;

/** Optional inert compare-task metadata; note installation never executes or imports it. */
export function readPackTasks(packsDir: string, name: string): PackTask[] {
  const manifest = readPack(packsDir, name);
  const file = path.join(packsDir, name, "tasks.json");
  if (!fs.existsSync(file)) return [];
  const { tasks } = tasksSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  const ids = new Set<string>();
  const languages = [...manifest.languages].sort().join(",");
  for (const task of tasks) {
    if (ids.has(task.id)) throw new Error(`duplicate task id: ${task.id}`);
    ids.add(task.id);
    if (Object.keys(task.title).sort().join(",") !== languages || Object.keys(task.prompt).sort().join(",") !== languages) {
      throw new Error(`task ${task.id} must provide title and prompt for every pack language`);
    }
    if (new Set(task.expected_layers).size !== task.expected_layers.length) {
      throw new Error(`task ${task.id} repeats an expected layer`);
    }
  }
  return tasks;
}
