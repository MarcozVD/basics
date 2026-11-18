import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { atomicWrite } from "./fsutil.js";
import type { Vault } from "./vault.js";
import { toId } from "./vault.js";

export const historyConfigPatchSchema = z
  .object({
    enabled: z.boolean().optional(),
    weight: z.number().finite().min(0).max(3).optional(),
  })
  .strict();
export const historyConfigSchema = z.object({
  enabled: historyConfigPatchSchema.shape.enabled.unwrap().default(true),
  weight: historyConfigPatchSchema.shape.weight.unwrap().default(1),
});
const vaultConfigSchema = z.object({ history: historyConfigSchema.default({ enabled: true, weight: 1 }) }).passthrough();
export type HistoryConfig = z.infer<typeof historyConfigSchema>;

/** Vault-local preferences, separate from the user's global connection/language config. */
export function loadVaultConfig(root: string): z.infer<typeof vaultConfigSchema> {
  const file = path.join(root, ".basics", "config.json");
  return vaultConfigSchema.parse(fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {});
}

export function saveHistoryConfig(root: string, patch: Partial<HistoryConfig>): HistoryConfig {
  const config = loadVaultConfig(root);
  config.history = historyConfigSchema.parse({ ...config.history, ...patch });
  atomicWrite(path.join(root, ".basics", "config.json"), `${JSON.stringify(config, null, 2)}\n`);
  return config.history;
}

export interface HistoryProject {
  id: string;
  title: string;
  outcome: "successful" | "failed" | "abandoned";
  /** Direction of this project's evidence, before the aggregate cap and weight. */
  contribution: 1 | -1;
}

/** Accepted notes only. No prose sentiment inference, pending proposals or invented projects. */
export function projectHistory(vault: Vault): Map<string, HistoryProject[]> {
  const result = new Map<string, HistoryProject[]>();
  for (const note of vault.byType("project").sort((a, b) => a.id.localeCompare(b.id))) {
    if (note.data.type !== "project") continue;
    const outcome = note.data.outcome ?? (note.data.status === "done" ? "successful" : undefined);
    if (!outcome) continue;
    for (const id of new Set(Object.values(note.data.stack).flat().map(toId))) {
      if (vault.get(id)?.data.type !== "tech") continue;
      const projects = result.get(id) ?? [];
      projects.push({ id: note.id, title: note.data.title ?? note.id, outcome, contribution: outcome === "successful" ? 1 : -1 });
      result.set(id, projects);
    }
  }
  return result;
}
