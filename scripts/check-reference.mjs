#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_OUT, generate, REFERENCE_FILES } from "./gen-reference.mjs";

function diffSummary(expected, actual) {
  const a = expected.split("\n");
  const b = actual.split("\n");
  let index = 0;
  while (index < a.length && index < b.length && a[index] === b[index]) index++;
  const preview = [];
  if (a[index] !== undefined) preview.push(`    - ${a[index].slice(0, 200)}`);
  if (b[index] !== undefined) preview.push(`    + ${b[index].slice(0, 200)}`);
  return { line: index + 1, delta: b.length - a.length, preview };
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "basics-reference-"));
try {
  await generate(temp);
  const problems = [];
  const generated = new Set(REFERENCE_FILES);

  if (fs.existsSync(DEFAULT_OUT)) {
    for (const entry of fs.readdirSync(DEFAULT_OUT, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".md") && !generated.has(entry.name)) {
        problems.push(`  unexpected file site/reference/${entry.name}`);
      }
    }
  }

  for (const file of REFERENCE_FILES) {
    const expectedFile = path.join(DEFAULT_OUT, file);
    if (!fs.existsSync(expectedFile)) {
      problems.push(`  missing site/reference/${file} (run npm run gen:reference)`);
      continue;
    }
    const expected = fs.readFileSync(expectedFile, "utf8");
    const actual = fs.readFileSync(path.join(temp, file), "utf8");
    if (expected === actual) continue;
    const diff = diffSummary(expected, actual);
    const delta = diff.delta >= 0 ? `+${diff.delta}` : String(diff.delta);
    problems.push(`  site/reference/${file}: differs at line ${diff.line} (${delta} lines)`, ...diff.preview);
  }

  if (problems.length) {
    console.error("Reference docs are out of date:");
    for (const problem of problems) console.error(problem);
    console.error("Run `npm run gen:reference` and commit site/reference/.");
    process.exit(1);
  }
  console.log(`reference docs up to date (${REFERENCE_FILES.length} files)`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
