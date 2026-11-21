import fs from "node:fs";

const stamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const windows = new Map(),
  rejected = [];
fs.readFileSync(0, "utf8")
  .split(/\r?\n/)
  .forEach((line, index) => {
    if (!line.trim()) return;
    let value;
    try {
      value = JSON.parse(line);
    } catch {
      rejected.push(index + 1);
      return;
    }
    const instant = value && typeof value.ts === "string" && stamp.test(value.ts) ? Date.parse(value.ts) : Number.NaN;
    if (!Number.isFinite(instant) || !Number.isFinite(value.ms) || typeof value.ms !== "number" || value.ms < 0) {
      rejected.push(index + 1);
      return;
    }
    const start = Math.floor(instant / 60000) * 60000;
    if (!windows.has(start)) windows.set(start, []);
    windows.get(start).push(value.ms);
  });
const percentile = (sorted, p) => sorted[Math.ceil((p / 100) * sorted.length) - 1];
const result = [...windows.keys()]
  .sort((a, b) => a - b)
  .map((start) => {
    const sorted = windows.get(start).sort((a, b) => a - b);
    return { start: new Date(start).toISOString(), count: sorted.length, p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
  });
console.log(JSON.stringify({ windows: result, rejected }));
