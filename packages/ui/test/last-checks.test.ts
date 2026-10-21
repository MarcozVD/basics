import { describe, expect, it } from "vitest";
import { checkTone, lastCheckChips, tailLines } from "../src/lib/last-checks";

describe("last check chips", () => {
  it("maps statuses to tones", () => {
    expect(checkTone("pass")).toBe("pass");
    expect(checkTone("fail")).toBe("fail");
    expect(checkTone("skip")).toBe("muted");
    expect(checkTone("untrusted")).toBe("muted");
  });

  it("keeps check ids and their results", () => {
    const chips = lastCheckChips({
      lint: { status: "pass", at: "2026-10-21T10:00:00.000Z", duration_ms: 120 },
      e2e: { status: "fail", at: "2026-10-21T10:01:00.000Z", output_tail: "boom" },
    });

    expect(chips.map((chip) => chip.id)).toEqual(["lint", "e2e"]);
    expect(chips.map((chip) => chip.tone)).toEqual(["pass", "fail"]);
    expect(lastCheckChips(undefined)).toEqual([]);
  });

  it("limits tooltip output to the last 20 lines", () => {
    const output = Array.from({ length: 25 }, (_, index) => `line ${index + 1}`).join("\n");
    const lines = tailLines(output);

    expect(lines).toHaveLength(20);
    expect(lines[0]).toBe("line 6");
    expect(lines.at(-1)).toBe("line 25");
    expect(tailLines(undefined)).toEqual([]);
  });
});
