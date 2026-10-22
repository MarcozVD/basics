import fs from "node:fs";
import path from "node:path";
import { atomicWrite } from "./fsutil.js";

export const CURRENT_SCHEMA_VERSION = 1;
export const VAULT_META_FILE = "basics.vault.json";

export interface VaultMeta {
  schemaVersion: number;
}

export function vaultMetaPath(root: string): string {
  return path.join(root, VAULT_META_FILE);
}

/** Read `basics.vault.json`; null when it is missing or invalid. */
export function readVaultMeta(root: string): VaultMeta | null {
  const file = vaultMetaPath(root);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { schemaVersion?: unknown };
    if (typeof raw.schemaVersion !== "number" || !Number.isInteger(raw.schemaVersion)) return null;
    return { schemaVersion: raw.schemaVersion };
  } catch {
    return null;
  }
}

export function writeVaultMeta(root: string): string {
  const file = vaultMetaPath(root);
  atomicWrite(file, `${JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION }, null, 2)}\n`);
  return file;
}

export type VaultMetaStatus = "ok" | "warn" | "error";

export interface VaultMetaCheck {
  status: VaultMetaStatus;
  message: string;
}

/** Status of the vault schema file against this build (old vaults keep working). */
export function checkVaultMeta(root: string, current: number = CURRENT_SCHEMA_VERSION): VaultMetaCheck {
  const meta = readVaultMeta(root);
  if (!meta) {
    return { status: "warn", message: `${VAULT_META_FILE} is missing or invalid; run \`basics doctor --fix\` to create it` };
  }
  if (meta.schemaVersion > current) {
    return {
      status: "error",
      message: `this vault was written by a newer basics (schema v${meta.schemaVersion}, this build supports v${current}); upgrade basics`,
    };
  }
  if (meta.schemaVersion < current) {
    return {
      status: "warn",
      message: `vault schema v${meta.schemaVersion} is older than v${current}; run \`basics doctor --fix\` to upgrade it`,
    };
  }
  return { status: "ok", message: `vault schema v${current}` };
}
