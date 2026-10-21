import fs from "node:fs";
import path from "node:path";

/** Packs shipped next to the compiled CLI, or the repo checkout when running from source. */
export function packsDir(): string {
  const bundled = path.join(import.meta.dirname, "packs");
  if (fs.existsSync(bundled)) return bundled;
  return path.resolve(import.meta.dirname, "../../..", "packs");
}
