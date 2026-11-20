import fs from "node:fs";
import path from "node:path";
import type { AcceptanceResult, AcceptanceSpec } from "@marcozvd/basics-core";
import { z } from "zod";

export const ACCEPTANCE_DIRECTORY = ".basics-acceptance";
const bundleSchema = z.strictObject({ files: z.record(z.string(), z.string()) });
const countsSchema = z.strictObject({
  passed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  failed: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});

export function validateAcceptance(spec: AcceptanceSpec): void {
  if (!spec.command.trim()) throw new Error("acceptance command must not be empty");
  const stat = fs.lstatSync(spec.bundle);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 10 * 1024 * 1024)
    throw new Error("acceptance bundle must be a regular JSON file no larger than 10 MiB");
}

/** Called only after shutdown proof and separate approval. No extraction before launch. */
export function stageAcceptance(spec: AcceptanceSpec, project: string): void {
  validateAcceptance(spec);
  const { files } = bundleSchema.parse(JSON.parse(fs.readFileSync(spec.bundle, "utf8")));
  const entries = Object.entries(files);
  if (!entries.length || entries.length > 1000) throw new Error("acceptance bundle requires 1 to 1000 files");
  for (const [name] of entries) {
    if (
      !name ||
      name.includes("\\") ||
      name
        .split("/")
        .some(
          (part) =>
            !part ||
            part === "." ||
            part === ".." ||
            /[:<>"|?*]|[. ]$/.test(part) ||
            Array.from(part).some((char) => char.charCodeAt(0) < 32) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        ) ||
      path.isAbsolute(name)
    )
      throw new Error("unsafe acceptance bundle path");
  }
  const target = path.join(project, ACCEPTANCE_DIRECTORY);
  fs.mkdirSync(target); // Exclusive: never follow or overwrite agent-created entries.
  for (const [name, content] of entries) {
    const file = path.join(target, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content, { flag: "wx" });
  }
}

export function acceptanceResult(stdout: string, status: string, duration_ms: number, truncated = false): AcceptanceResult {
  const error = (reason: string): AcceptanceResult => ({ status: "error", passed: null, failed: null, duration_ms, reason });
  if (truncated) return error("Acceptance output exceeded the capture limit");
  const lines = stdout.trim().split(/\r?\n/);
  if (lines.length !== 1 || !lines[0]) return error("Acceptance command must print exactly one JSON line {passed, failed}");
  let counts: z.infer<typeof countsSchema>;
  try {
    counts = countsSchema.parse(JSON.parse(lines[0]));
  } catch {
    return error("Invalid acceptance counts: expected only nonnegative safe integers passed and failed");
  }
  if (status !== "pass" && status !== "fail") return error(`Acceptance command ${status}`);
  if ((status === "pass") !== (counts.failed === 0)) return error("Acceptance exit status disagrees with counts");
  return { status: counts.failed ? "fail" : "pass", ...counts, duration_ms };
}
