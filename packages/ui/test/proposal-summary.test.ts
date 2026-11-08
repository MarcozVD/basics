import type { NoteData } from "@marcozvd/basics-core";
import { describe, expect, it } from "vitest";
import { summarizeProposal } from "../src/lib/proposal-summary";

function tech(overrides: Partial<NoteData> = {}): NoteData {
  return {
    type: "tech",
    kind: "framework",
    title: "FastAPI",
    layer: "backend",
    tags: [],
    source: "manual",
    use_when: [],
    avoid_when: [],
    performs_best: [],
    related: [],
    practices: [],
    checks: [],
    ...overrides,
  } as NoteData;
}

describe("summarizeProposal", () => {
  it("describes a create with its type and layer", () => {
    const summary = summarizeProposal(null, tech());

    expect(summary).toEqual({ create: true, type: "tech", layer: "Backend", changes: [] });
  });

  it("describes a create without a layer", () => {
    const summary = summarizeProposal(null, tech({ type: "practice", applies_to: [] } as unknown as Partial<NoteData>));

    expect(summary.create).toBe(true);
    expect(summary.layer).toBeUndefined();
  });

  it("reads tags, sections and fields from parsed data", () => {
    const before = tech({ tags: ["api"], use_when: ["one"] });
    const after = tech({ tags: ["api", "errors"], use_when: ["one", "two"] });
    const summary = summarizeProposal(before, after, "# FastAPI\n\n## Uno\n", "# FastAPI\n\n## Uno\n\n## Errores\n");

    expect(summary.changes).toEqual([
      { kind: "tags", action: "add", values: ["errors"] },
      { kind: "section", action: "add", values: ["Errores"] },
      { kind: "field", field: "use_when" },
    ]);
  });

  it("reports removed tags and sections", () => {
    const before = tech({ tags: ["api", "old"] });
    const after = tech({ tags: ["api"] });
    const summary = summarizeProposal(before, after, "## Uno\n\n## Old\n", "## Uno\n");

    expect(summary.changes).toEqual([
      { kind: "tags", action: "remove", values: ["old"] },
      { kind: "section", action: "remove", values: ["Old"] },
    ]);
  });

  it("ignores provenance, updated and the type discriminator", () => {
    const before = tech({ source: "manual", updated: "2026-01-01" });
    const after = tech({ source: "agent:claude-code", updated: "2026-02-02" });
    const summary = summarizeProposal(before, after);

    expect(summary.changes).toEqual([]);
  });

  it("reports a body edit only when no section changed", () => {
    const before = tech();
    const after = tech();
    const summary = summarizeProposal(before, after, "# FastAPI\n\nOriginal.\n", "# FastAPI\n\nRewritten.\n");

    expect(summary.changes).toEqual([{ kind: "body" }]);
  });

  it("treats a missing list as empty", () => {
    const before = tech({ use_when: undefined } as unknown as Partial<NoteData>);
    const after = tech({ use_when: ["one"] });

    expect(summarizeProposal(before, after).changes).toEqual([{ kind: "field", field: "use_when" }]);
  });
});
