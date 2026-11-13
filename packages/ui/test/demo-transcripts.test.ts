import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { generateTranscripts, serializeTranscripts } from "../../../scripts/demo/generate-transcripts.mjs";
import scenarios from "../../../scripts/demo/scenarios.json";
import transcripts from "../../../site/.vitepress/theme/landing/transcripts";

describe("generated demo transcripts", () => {
  it("stays byte-for-byte in sync with a fresh vault and stays deterministic across independent vaults", () => {
    const expected = fs.readFileSync(new URL("../../../scripts/demo/transcripts.json", import.meta.url), "utf8");
    const first = generateTranscripts();
    expect(serializeTranscripts(first), "Run npm run demo:transcripts after changing transcript sources.").toBe(expected);
    expect(serializeTranscripts(generateTranscripts())).toBe(expected);
    expect(transcripts).toEqual(first);
  });

  it("covers five complete bilingual scenario answers plus proposal, connect and check", () => {
    expect(transcripts.version).toBe(1);
    expect(transcripts.entries.map((entry) => entry.id)).toEqual([
      ...scenarios.map((scenario) => scenario.id),
      "agent-proposal",
      "basics-connect",
      "basics-check",
    ]);
    for (const scenario of scenarios) {
      const entry = transcripts.entries.find((item) => item.id === scenario.id)!;
      expect(entry.simulated).toBe(true);
      for (const language of ["en", "es"] as const) {
        expect(entry.command[language]).toBe(`recommend_stack ${JSON.stringify(scenario.prompt[language])}`);
        for (const layer of scenario.layers)
          for (const tech of layer.technologies)
            expect(entry.answerLines[language].some((line) => line.endsWith(tech.reason[language]))).toBe(true);
        expect(entry.answerLines[language]).toHaveLength(scenario.layers.reduce((n, layer) => n + layer.technologies.length, 0) + 2);
      }
    }
    for (const entry of transcripts.entries) {
      for (const language of ["en", "es"] as const) {
        expect(entry.label[language]).not.toBe("");
        expect(entry.command[language]).not.toMatch(/^[>\s]/);
        expect(entry.answerLines[language].length).toBeGreaterThan(0);
        for (const line of entry.answerLines[language]) {
          expect(line).not.toMatch(/[\r\n\u2014]/);
          expect(line).not.toContain(String.fromCharCode(27));
        }
      }
    }
    const check = transcripts.entries.find((entry) => entry.id === "basics-check")!;
    expect(check.command.en).toContain("--list");
    expect(check.answerLines.en).toContain("typescript-typecheck  npx tsc --noEmit  no");
    expect(check.answerLines.en.join("\n")).not.toMatch(/pass|fail|\b\d+\s*ms\b|[A-Z]:\\|basics-demo-/);
  });
});
