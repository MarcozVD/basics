/**
 * The synthetic vault the perf harnesses use: layers, techs cross-linked by `related` and
 * `practices`, plus profiles, in the same shape `packages/ui/e2e/serve.mjs` writes.
 */

import fs from "node:fs";
import path from "node:path";

export function generateLargeVault(dir, { techs = 600, practices = 240, layers = 12, profiles = 8 } = {}) {
  const write = (folder, id, frontmatter, body) => {
    fs.mkdirSync(path.join(dir, folder), { recursive: true });
    fs.writeFileSync(path.join(dir, folder, `${id}.md`), `---\n${frontmatter}\n---\n\n${body}\n`);
  };
  for (let i = 0; i < layers; i++) {
    write("layers", `layer-${i}`, `type: layer\ntitle: Layer ${i}\ndescription: Synthetic layer ${i}`, `# Layer ${i}`);
  }
  for (let i = 0; i < techs; i++) {
    const related = [`tech-${(i + 1) % techs}`, `tech-${(i + 7) % techs}`];
    write(
      "tech",
      `tech-${i}`,
      [
        "type: tech",
        "kind: framework",
        `title: Tech ${i}`,
        `layer: layer-${i % layers}`,
        `related: [${related.join(", ")}]`,
        `practices: [practice-${i % practices}]`,
      ].join("\n"),
      `# Tech ${i}\n\nSynthetic tech for the search and token harness.`,
    );
  }
  for (let i = 0; i < practices; i++) {
    write(
      "practices",
      `practice-${i}`,
      `type: practice\ntitle: Practice ${i}\napplies_to: [tech-${(i * 5) % techs}]`,
      `- Synthetic practice ${i}.`,
    );
  }
  for (let i = 0; i < profiles; i++) {
    const stack = Array.from({ length: layers }, (_, layer) => `  layer-${layer}: [tech-${(layer + i) % techs}]`).join("\n");
    write("profiles", `profile-${i}`, `type: profile\ntitle: Profile ${i}\nstack:\n${stack}`, `# Profile ${i}`);
  }
}
