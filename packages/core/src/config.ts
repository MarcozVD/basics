import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { atomicWrite } from "./fsutil.js";

export const configSchema = z.object({
  vault: z.string().optional(),
  language: z.enum(["en", "es"]).default("en"),
  embeddings: z.boolean().default(false),
  embeddingsModel: z.string().default("Xenova/multilingual-e5-small"),
});
export type Config = z.infer<typeof configSchema>;

/** Config file location: $BASICS_CONFIG or ~/.config/basics/config.json (same on Windows). */
export function configPath(): string {
  return process.env.BASICS_CONFIG ?? path.join(os.homedir(), ".config", "basics", "config.json");
}

export const DEFAULT_VAULT: string = path.join(os.homedir(), "basics-vault");

export function loadConfig(): Config {
  const file = configPath();
  if (!fs.existsSync(file)) return configSchema.parse({});
  try {
    return configSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
  } catch (err) {
    throw new Error(`Invalid config at ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export function saveConfig(cfg: Config): void {
  atomicWrite(configPath(), `${JSON.stringify(cfg, null, 2)}\n`);
}

export function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Precedence: explicit > $BASICS_DIR > config "vault" > ~/basics-vault. */
export function resolveVaultDir(explicit?: string): string {
  const dir = explicit ?? process.env.BASICS_DIR ?? loadConfig().vault ?? DEFAULT_VAULT;
  return path.resolve(expandHome(dir));
}
