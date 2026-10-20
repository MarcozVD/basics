import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// Windows rename fails while another process holds the file; retry those codes briefly.
const RETRY_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);
const RENAME_ATTEMPTS = 5;

/** Sleep without timers so callers can stay synchronous. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Write via a temp file in the same directory + rename, so readers never see a half-written note. */
export function atomicWrite(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, content);
  for (let attempt = 1; attempt <= RENAME_ATTEMPTS; attempt++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (attempt === RENAME_ATTEMPTS || !RETRY_CODES.has(code)) {
        try {
          fs.rmSync(tmp, { force: true });
        } catch {
          // best effort: the temp file is stale but the original error matters more
        }
        throw err;
      }
      sleepSync(20);
    }
  }
}
