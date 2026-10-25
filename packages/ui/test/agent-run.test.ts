import { describe, expect, it } from "vitest";
import { formatElapsed, isAgentRunSettled, mentionedTechIds } from "../src/lib/agent-run";

describe("mentionedTechIds", () => {
  it("returns existing ids in first-appearance order, without duplicates", () => {
    const known = new Set(["fastapi", "pytest", "react"]);
    const text = "Usaremos [[fastapi]] y [[pytest]], no [[react]]. Otra vez [[fastapi]].";
    expect(mentionedTechIds(text, known)).toEqual(["fastapi", "pytest", "react"]);
  });

  it("ignores ids the vault does not have (the ones the answer proposes)", () => {
    const known = new Set(["fastapi"]);
    expect(mentionedTechIds("[[fastapi]] más [[rustls]]", known)).toEqual(["fastapi"]);
  });

  it("honours labels", () => {
    const known = new Set(["fastapi", "pytest"]);
    expect(mentionedTechIds("[[fastapi|API]] y [[pytest]]", known)).toEqual(["fastapi", "pytest"]);
  });
});

describe("formatElapsed", () => {
  it("shows seconds under a minute and pads past it", () => {
    expect(formatElapsed(12_000)).toBe("12s");
    expect(formatElapsed(65_000)).toBe("1m 05s");
    expect(formatElapsed(0)).toBe("0s");
  });
});

describe("isAgentRunSettled", () => {
  it("is true only for the terminal states", () => {
    expect(isAgentRunSettled("done")).toBe(true);
    expect(isAgentRunSettled("error")).toBe(true);
    expect(isAgentRunSettled("cancelled")).toBe(true);
    expect(isAgentRunSettled("running")).toBe(false);
    expect(isAgentRunSettled("idle")).toBe(false);
  });
});
