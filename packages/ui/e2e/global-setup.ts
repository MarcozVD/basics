import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Expose the vault created by serve.mjs to tests that need to touch files on disk. */
export default function globalSetup(): void {
  const file = path.join(here, ".vault-path");
  if (!fs.existsSync(file)) throw new Error(`missing ${file}; did the e2e web server start?`);
  process.env.BASICS_E2E_VAULT = fs.readFileSync(file, "utf8").trim();
}
