import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { hash, STACKS } from "./github-data.mjs";

export function auditDataset(bytes, labels) {
  if (hash(bytes) !== labels.dataset_sha256) throw new Error("Quality labels belong to a different frozen corpus");
  const dataset = JSON.parse(bytes);
  const byRepo = new Map(dataset.cases.map((c) => [c.repo.replace("https://github.com/", ""), c]));
  const membership = new Map();
  for (const category of ["library", "example", "mixed"])
    for (const repo of labels[category]) {
      if (!byRepo.has(repo) || membership.has(repo)) throw new Error(`Invalid/duplicate quality label: ${repo}`);
      membership.set(repo, category);
    }
  for (const repo of labels.generic_or_weak) if (!byRepo.has(repo)) throw new Error(`Unknown generic-description label: ${repo}`);
  const cases = [...byRepo].map(([repo, c]) => ({
    repo,
    stack: c.stack,
    category: membership.get(repo) ?? "app",
    generic_or_weak: labels.generic_or_weak.includes(repo),
    layers: Object.keys(c.expect).length,
    empty: !c.description.trim(),
    words: c.description.trim().split(/\s+/).length,
    description: c.description,
  }));
  const counts = STACKS.map((stack) => ({
    stack,
    ...Object.fromEntries(
      ["app", "library", "example", "mixed"].map((category) => [
        category,
        cases.filter((c) => c.stack === stack && c.category === category).length,
      ]),
    ),
    generic_or_weak: cases.filter((c) => c.stack === stack && c.generic_or_weak).length,
  }));
  return {
    dataset_sha256: labels.dataset_sha256,
    method: labels.method,
    rubric: labels.generic_rubric,
    counts,
    one_layer: cases.filter((c) => c.layers === 1),
    fewer_than_two_layers: cases.filter((c) => c.layers < 2),
    empty: cases.filter((c) => c.empty),
    generic: cases.filter((c) => c.generic_or_weak),
    cases,
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const bytes = fs.readFileSync(new URL("./github-repos.json", import.meta.url), "utf8");
  const labels = JSON.parse(fs.readFileSync(new URL("./github-quality-labels.json", import.meta.url), "utf8"));
  console.log(JSON.stringify(auditDataset(bytes, labels), null, 2));
}
