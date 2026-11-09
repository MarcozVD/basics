import type { Candidate } from "@marcozvd/basics-core";
import { describe, expect, it } from "vitest";
import { buildShortlist } from "../src/lib/recommend-shortlist";

function candidate(id: string, score = 1): Candidate {
  return {
    id,
    kind: "framework",
    score,
    matched_use_when: [],
    matched_performs_best: [],
    matched_avoid_when: [],
    negated_use_when: [],
    negated_avoid_when: [],
    language_boost: 0,
    score_breakdown: { keywords: score, text: 0, synonyms: 0, negation: 0, language: 0 },
  };
}

describe("buildShortlist", () => {
  it("keeps one card under its primary layer and reports where else it fits", () => {
    const shortlist = buildShortlist(
      {
        backend: [candidate("fastapi"), candidate("postgresql")],
        data: [candidate("postgresql"), candidate("redis")],
      },
      (id) => ({ postgresql: "data" })[id],
    );

    expect(shortlist.map((section) => section.layer)).toEqual(["backend", "data"]);
    expect(shortlist[0].cards.map((card) => card.candidate.id)).toEqual(["fastapi"]);
    expect(shortlist[1].cards.map((card) => card.candidate.id)).toEqual(["postgresql", "redis"]);
    expect(shortlist[1].cards[0].alsoLayers).toEqual(["backend"]);
    expect(shortlist[1].cards[1].alsoLayers).toEqual([]);
  });

  it("falls back to the first matching layer when the primary was not requested", () => {
    const shortlist = buildShortlist({ data: [candidate("postgresql")] }, () => "backend");

    expect(shortlist).toHaveLength(1);
    expect(shortlist[0].cards[0].layer).toBe("data");
    expect(shortlist[0].cards[0].alsoLayers).toEqual([]);
  });

  it("uses the candidate scored for the layer that owns the card", () => {
    const backend = candidate("postgresql", 2);
    const data = candidate("postgresql", 7);
    data.score_breakdown = { keywords: 7, text: 3, synonyms: 0, negation: 0, language: 0 };

    const shortlist = buildShortlist({ backend: [backend], data: [data] }, () => "data");

    expect(shortlist).toHaveLength(1);
    expect(shortlist[0].layer).toBe("data");
    expect(shortlist[0].cards[0].candidate.score_breakdown.keywords).toBe(7);
    expect(shortlist[0].cards[0].alsoLayers).toEqual(["backend"]);
  });

  it("drops a layer whose only cards moved to their primary layer", () => {
    const shortlist = buildShortlist(
      {
        backend: [candidate("fastapi")],
        data: [candidate("fastapi")],
      },
      () => "backend",
    );

    expect(shortlist).toHaveLength(1);
    expect(shortlist[0].cards[0].alsoLayers).toEqual(["data"]);
  });
});
