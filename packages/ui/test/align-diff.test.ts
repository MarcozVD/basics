import { describe, expect, it } from "vitest";
import { alignDiff, foldDiff } from "../src/lib/align-diff";

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

describe("foldDiff", () => {
  it("keeps unchanged runs of six lines visible", () => {
    const text = ["1", "2", "3", "4", "5", "6", "new"].join("\n");
    const rows = alignDiff(text, `${["1", "2", "3", "4", "5", "6"].join("\n")}\nchanged`);
    const segments = foldDiff(rows);

    expect(segments.filter((segment) => segment.kind === "fold")).toHaveLength(0);
  });

  it("folds unchanged runs longer than six lines", () => {
    const before = ["1", "2", "3", "4", "5", "6", "7", "old", "8"].join("\n");
    const after = ["1", "2", "3", "4", "5", "6", "7", "new", "8"].join("\n");
    const segments = foldDiff(alignDiff(before, after));
    const folds = segments.filter((segment) => segment.kind === "fold");

    expect(folds).toHaveLength(1);
    expect(folds[0]).toMatchObject({ kind: "fold", count: 7, key: 1 });
  });

  it("does not fold added lines", () => {
    const segments = foldDiff(alignDiff(null, Array.from({ length: 8 }, (_, index) => `line ${index}`).join("\n")));

    expect(segments.every((segment) => segment.kind === "rows")).toBe(true);
  });
});
