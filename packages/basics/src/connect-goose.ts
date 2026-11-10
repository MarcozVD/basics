import fs from "node:fs";
import { parseFrontmatter } from "@marcozvd/basics-core";

/** Goose accepts YAML. Reuse the safe YAML reader already shipped by core. */
export function gooseConfig(text: string): Record<string, unknown> {
  if (/^---\s*$/m.test(text)) throw new Error("multiple YAML documents require manual editing");
  const parsed = parseFrontmatter(`---\n${text}\n---\n`);
  if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) throw new Error("expected a YAML mapping");
  return parsed.data;
}

export function gooseEntry(file: string): unknown {
  const extensions = gooseConfig(fs.readFileSync(file, "utf8")).extensions;
  return extensions && typeof extensions === "object" ? (extensions as Record<string, unknown>).basics : undefined;
}

/** Replace only Basics in a block mapping. Unusual YAML stays untouched for manual editing. */
export function editGoose(text: string, value?: Record<string, unknown>): string {
  const root = gooseConfig(text);
  const extensions = root.extensions;
  if (extensions !== undefined && (!extensions || typeof extensions !== "object" || Array.isArray(extensions))) {
    throw new Error("extensions must be a YAML mapping");
  }
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const ending = text.endsWith("\n") ? nl : "";
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  const index = lines.findIndex((line) => /^extensions\s*:/.test(line));
  // JSON is valid YAML and keeps command arguments escaped without a second serializer.
  const entry = value ? `  basics: ${JSON.stringify(value)}` : undefined;
  if (extensions === undefined) {
    if (!entry) return text;
    return [...lines, "extensions:", entry].join(nl) + ending;
  }
  if (index === -1 || !/^extensions\s*:\s*(?:\{\s*\})?\s*(?:#.*)?$/.test(lines[index])) {
    throw new Error("flow or quoted extensions mapping requires manual editing");
  }
  let end = index + 1;
  while (end < lines.length && !/^\S[^#]*:/.test(lines[end])) end++;
  const mapping = extensions as Record<string, unknown>;
  const start = lines.findIndex((line, i) => i > index && i < end && /^ {2}basics\s*:/.test(line));
  if ("basics" in mapping && start === -1) throw new Error("nonstandard Basics indentation requires manual editing");
  if (value && JSON.stringify(mapping.basics) === JSON.stringify(value)) return text;
  if (start !== -1) {
    let stop = start + 1;
    while (stop < end && !/^ {2}\S/.test(lines[stop]) && !/^#/.test(lines[stop])) stop++;
    lines.splice(start, stop - start, ...(entry ? [entry] : []));
  } else if (entry) {
    lines.splice(end, 0, entry);
  } else return text;
  // Keep an empty mapping valid when disconnecting the final extension.
  if (/^extensions\s*:\s*\{/.test(lines[index])) lines[index] = "extensions:";
  if (!value && Object.keys(mapping).length === 1) lines[index] = "extensions: {}";
  const after = lines.join(nl) + ending;
  const checked = gooseConfig(after);
  const expected = { ...mapping };
  if (value) expected.basics = value;
  else delete expected.basics;
  if (JSON.stringify(checked) !== JSON.stringify({ ...root, extensions: expected })) {
    throw new Error("YAML layout requires manual editing");
  }
  return after;
}
