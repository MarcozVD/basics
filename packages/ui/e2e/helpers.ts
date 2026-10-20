import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Path of the temp vault created by serve.mjs for this run. */
export function vaultPath(): string {
  return fs.readFileSync(path.join(here, ".vault-path"), "utf8").trim();
}
