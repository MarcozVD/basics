import { describe, expect, it } from "vitest";
import { alignDiff } from "../src/lib/align-diff";

describe("alignDiff", () => {
  it("keeps identical texts aligned", () => {
    const rows = alignDiff("alpha\nbeta", "alpha\nbeta");

    expect(rows).toEqual([
      { kind: "equal", left: { lineNumber: 1, text: "alpha" }, right: { lineNumber: 1, text: "alpha" } },
      { kind: "equal", left: { lineNumber: 2, text: "beta" }, right: { lineNumber: 2, text: "beta" } },
    ]);
  });

  it("pairs a changed line side by side", () => {
    const rows = alignDiff("alpha\nbeta\ngamma", "alpha\nBETA\ngamma");

    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual({
      kind: "change",
      left: { lineNumber: 2, text: "beta" },
      right: { lineNumber: 2, text: "BETA" },
    });
  });

  it("marks every line as added when before is null", () => {
    const rows = alignDiff(null, "one\ntwo");

    expect(rows).toEqual([
      { kind: "add", left: null, right: { lineNumber: 1, text: "one" } },
      { kind: "add", left: null, right: { lineNumber: 2, text: "two" } },
    ]);
  });
});
