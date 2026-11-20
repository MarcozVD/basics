import fs from "node:fs";
import path from "node:path";

// One-time import of an owner-run comparison. Builds consume only the sanitized committed file.
export function sanitizeRecording(input) {
  const report = structuredClone(input);
  report.recorded = true;
  delete report.file;
  delete report.keep;
  for (const result of report.results) {
    delete result.directory;
    result.output = result.output.slice(0, 600);
  }
  const scrub = (value) => {
    if (typeof value === "string")
      return value
        .replace(/[A-Za-z]:[\\/][^\s"'<>\r\n]*/g, "[local path]")
        .replace(/\/(?:Users|home|tmp|private|var)\/[^\s"'<>\r\n]*/g, "[local path]");
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, scrub(entry)]));
    return value;
  };
  return scrub(report);
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename && process.argv[2]) {
  const report = sanitizeRecording(JSON.parse(fs.readFileSync(process.argv[2], "utf8")));
  fs.writeFileSync(new URL("./compare-recorded.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
}
