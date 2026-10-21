import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";
import { recommend, splitNegations, Vault } from "../src/index.js";

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");

test("splitNegations keeps text without negation untouched", () => {
  const description = "API REST en Python con Postgres";
  assert.deepEqual(splitNegations(description), { positive: description, negated: [] });
});

test("splitNegations parses Spanish cues and multiple clauses", () => {
  assert.deepEqual(splitNegations("API en Python sin SEO, sin login y sin analytics"), {
    positive: "API en Python",
    negated: ["SEO", "login", "analytics"],
  });
  assert.deepEqual(splitNegations("no quiero React pero sí Vue"), { positive: "sí Vue", negated: ["React"] });
  assert.deepEqual(splitNegations("SIN NECESIDAD DE SEO"), { positive: "", negated: ["SEO"] });
});

test("splitNegations parses English cues and conjunctions", () => {
  assert.deepEqual(splitNegations("API without a frontend"), { positive: "API", negated: ["a frontend"] });
  assert.deepEqual(splitNegations("no need for a browser, just a REST API"), {
    positive: "just a REST API",
    negated: ["a browser"],
  });
  assert.deepEqual(splitNegations("do not need SSR and not a dashboard"), {
    positive: "",
    negated: ["SSR", "a dashboard"],
  });
  assert.deepEqual(splitNegations("sin SEO y sin frontend"), { positive: "", negated: ["SEO", "frontend"] });
});

test("recommend boosts the language named in the description", () => {
  const result = recommend(Vault.load(SEED), "React dashboard en TypeScript", { perLayer: 10 });
  const react = result.layers.frontend.find((candidate) => candidate.id === "react");
  const fastapi = result.layers.backend.find((candidate) => candidate.id === "fastapi");
  assert.equal(react?.language_boost, 3);
  assert.equal(react?.score_breakdown.language, 3);
  assert.equal(fastapi?.language_boost, -2);
});
