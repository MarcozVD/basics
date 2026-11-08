import { describe, expect, it } from "vitest";
import { alignDiff, type DiffSegment, foldDiff } from "../src/lib/align-diff";

function visible(segments: DiffSegment[]): string[] {
  return segments.flatMap((segment) => (segment.kind === "rows" ? segment.rows.map((row) => row.right?.text ?? row.left?.text ?? "") : []));
}

function folds(segments: DiffSegment[]) {
  return segments.filter((segment) => segment.kind === "fold");
}

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
  it("keeps three context lines before a hunk", () => {
    const before = Array.from({ length: 10 }, (_, index) => `line ${index + 1}`).join("\n");
    const segments = foldDiff(alignDiff(before, `${before.split("\n").slice(0, 9).join("\n")}\nchanged`));

    expect(folds(segments)).toHaveLength(1);
    expect(folds(segments)[0]).toMatchObject({ kind: "fold", count: 6, key: 1 });
    expect(visible(segments)).toEqual(["line 7", "line 8", "line 9", "changed"]);
  });

  it("keeps three context lines on each side of a hunk", () => {
    const before = ["start", ...Array.from({ length: 10 }, (_, index) => `line ${index + 1}`), "old", "end"].join("\n");
    const after = ["start", ...Array.from({ length: 10 }, (_, index) => `line ${index + 1}`), "new", "end"].join("\n");
    const segments = foldDiff(alignDiff(before, after));

    expect(folds(segments)).toHaveLength(1);
    expect(folds(segments)[0]).toMatchObject({ count: 8 });
    expect(visible(segments)).toEqual(["line 8", "line 9", "line 10", "new", "end"]);
  });

  it("does not fold when the unchanged run fits in the context", () => {
    const middle = ["1", "2", "3", "4", "5", "6"];
    const before = ["old", ...middle, "old2"].join("\n");
    const after = ["new", ...middle, "new2"].join("\n");
    const segments = foldDiff(alignDiff(before, after));

    expect(folds(segments)).toHaveLength(0);
  });

  it("keeps the frontmatter key visible when context hides the block start", () => {
    const lines = [
      "---",
      "type: tech",
      "title: FastAPI",
      "use_when:",
      "  - one",
      "  - two",
      "  - three",
      "  - four",
      "  - five",
      "  - six",
      "  - seven",
      "avoid_when: []",
      "---",
      "Body",
    ];
    const before = lines.join("\n");
    const after = [...lines.slice(0, 10), "  - SEVEN", ...lines.slice(11)].join("\n");
    const segments = foldDiff(alignDiff(before, after));

    expect(visible(segments)).toContain("use_when:");
    expect(visible(segments)).not.toContain("  - one");
  });

  it("does not fold added lines", () => {
    const segments = foldDiff(alignDiff(null, Array.from({ length: 8 }, (_, index) => `line ${index}`).join("\n")));

    expect(segments.every((segment) => segment.kind === "rows")).toBe(true);
  });
});
