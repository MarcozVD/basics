import { fileURLToPath } from "node:url";
import { packNotes } from "@marcozvd/basics-core";
import { describe, expect, it } from "vitest";
import scenarios from "../../../scripts/demo/scenarios.json";
import { matchScenario } from "../../../scripts/demo/scenarios.mjs";

describe("simulated demo scenarios", () => {
  it.each(scenarios)("matches both labels for $id", (scenario) => {
    for (const prompt of Object.values(scenario.prompt)) expect(matchScenario(prompt, scenarios)?.id).toBe(scenario.id);
  });
  it("chooses most distinct keyword hits, retaining file order on ties", () => {
    expect(matchScenario("Python API batch", scenarios)?.id).toBe("python-api");
    expect(matchScenario("Python Python Python batch ETL", scenarios)?.id).toBe("data-pipeline");
    expect(matchScenario("CLI API", scenarios)?.id).toBe("python-api");
  });
  it("normalizes accents, punctuation and case without partial-word matches", () => {
    expect(matchScenario("APLICACIÓN MÓVIL", scenarios)?.id).toBe("mobile-app");
    expect(matchScenario("Next.JS SaaS", scenarios)?.id).toBe("nextjs-saas");
    for (const text of ["", "   ", "tropical climate", "mystery project"]) expect(matchScenario(text, scenarios)).toBeNull();
  });
  it("uses existing layer, technology, practice and check notes with localized reasons", () => {
    const packs = fileURLToPath(new URL("../../../packs/", import.meta.url));
    const notes = ["core-layers", "web-typescript", "python-api", "profiles"].flatMap((name) => packNotes(packs, name, "en"));
    const types = new Map(notes.map((note) => [note.id, note.type]));
    expect(scenarios).toHaveLength(5);
    for (const scenario of scenarios) {
      for (const layer of scenario.layers) {
        expect(types.get(layer.id)).toBe("layer");
        for (const tech of layer.technologies) {
          expect(types.get(tech.id)).toBe("tech");
          expect(tech.reason.en).not.toBe("");
          expect(tech.reason.es).not.toBe("");
        }
      }
      for (const id of scenario.practices) expect(types.get(id)).toBe("practice");
      for (const id of scenario.checks) expect(types.get(id)).toBe("check");
    }
  });
});
