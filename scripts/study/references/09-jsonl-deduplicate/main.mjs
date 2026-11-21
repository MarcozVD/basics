import fs from "node:fs";

const kept = [],
  diagnostics = [],
  seen = new Set();
const lines = fs.readFileSync(0, "utf8").split(/\r?\n/);
lines.forEach((line, index) => {
  if (!line.trim()) return;
  let value;
  try {
    value = JSON.parse(line);
  } catch {
    diagnostics.push({ line: index + 1, reason: "malformed" });
    return;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    diagnostics.push({ line: index + 1, reason: "malformed" });
    return;
  }
  if (typeof value.id !== "string" || value.id === "") {
    diagnostics.push({ line: index + 1, reason: "missing_id" });
    return;
  }
  if (seen.has(value.id)) return;
  seen.add(value.id);
  kept.push(JSON.stringify(value));
});
if (kept.length) process.stdout.write(`${kept.join("\n")}\n`);
if (diagnostics.length) process.stderr.write(`${diagnostics.map((item) => JSON.stringify(item)).join("\n")}\n`);
