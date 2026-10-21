import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { basicsDir } from "./activity.js";
import type { Vault } from "./vault.js";

interface TrustEntry {
  command: string;
  dir: string;
  at: string;
}

export function trustPath(root: string): string {
  return path.join(root, ".basics", "trust.json");
}

/** Commands are trusted per absolute directory, so moving or editing the project asks again. */
function trustKey(dir: string, command: string): string {
  return crypto.createHash("sha256").update(`${dir}\n${command}`).digest("hex");
}

function readTrust(root: string): Record<string, TrustEntry> {
  const file = trustPath(root);
  if (!fs.existsSync(file)) return {};
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, TrustEntry>) : {};
  } catch {
    return {};
  }
}

export function isTrusted(vault: Vault, dir: string, command: string): boolean {
  const absolute = path.resolve(dir);
  const entry = readTrust(vault.root)[trustKey(absolute, command)];
  return entry?.command === command && entry.dir === absolute;
}

export function trust(vault: Vault, dir: string, command: string): void {
  const absolute = path.resolve(dir);
  const entries = readTrust(vault.root);
  entries[trustKey(absolute, command)] = { command, dir: absolute, at: new Date().toISOString() };
  basicsDir(vault.root);
  fs.writeFileSync(trustPath(vault.root), `${JSON.stringify(entries, null, 2)}\n`);
}
