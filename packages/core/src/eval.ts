import type { Recommendation } from "./query.js";
import type { Vault } from "./vault.js";

/** What a single layer should recommend for one eval case. */
export interface EvalExpectation {
  /** Exact expected first candidate. */
  top1?: string;
  /** Acceptable candidates for the top three (any one is enough). */
  top3?: string[];
  /** Candidates that must not be recommended at all for this layer. */
  forbid?: string[];
}

export interface EvalCase {
  description: string;
  lang: "en" | "es";
  expect: Record<string, EvalExpectation>;
}

export interface EvalLayerResult {
  layer: string;
  top: string[];
  expected_top1?: string;
  expected_top3: string[];
  forbidden: string[];
  hit1: boolean;
  hit3: boolean;
  violations: string[];
}

export interface EvalCaseResult {
  description: string;
  lang: "en" | "es";
  layers: EvalLayerResult[];
  hit1: boolean;
  hit3: boolean;
  forbidViolations: number;
}

export interface EvalResult {
  cases: number;
  /** Share of layer expectations whose first candidate matched (0..1). */
  hit1: number;
  /** Share of layer expectations whose top three contained an expected candidate (0..1). */
  hit3: number;
  /** Number of forbidden candidates that showed up. */
  forbidViolations: number;
  perCase: EvalCaseResult[];
}

/**
 * Run recommendation cases against a vault. Metrics are averaged over every layer
 * expectation, so full-stack cases weigh more when they check more layers.
 */
export function evaluate(vault: Vault, cases: EvalCase[], recommendFn: (vault: Vault, description: string) => Recommendation): EvalResult {
  const perCase = cases.map((testCase): EvalCaseResult => {
    const recommendation = recommendFn(vault, testCase.description);
    const layers = Object.entries(testCase.expect).map(([layer, expected]): EvalLayerResult => {
      const top = (recommendation.layers[layer] ?? []).map((candidate) => candidate.id);
      const top3 = top.slice(0, 3);
      const expectedTop3 = expected.top3 ?? (expected.top1 ? [expected.top1] : []);
      const hit1 = expected.top1 ? top[0] === expected.top1 : expectedTop3.length > 0 && expectedTop3.includes(top[0]);
      const hit3 = expectedTop3.length > 0 && top3.some((id) => expectedTop3.includes(id));
      const forbidden = expected.forbid ?? [];
      return {
        layer,
        top,
        expected_top1: expected.top1,
        expected_top3: expectedTop3,
        forbidden,
        hit1,
        hit3,
        violations: forbidden.filter((id) => top.includes(id)),
      };
    });
    return {
      description: testCase.description,
      lang: testCase.lang,
      layers,
      hit1: layers.every((layer) => layer.hit1),
      hit3: layers.every((layer) => layer.hit3),
      forbidViolations: layers.reduce((sum, layer) => sum + layer.violations.length, 0),
    };
  });

  const expectations = perCase.flatMap((testCase) => testCase.layers);
  const total = expectations.length;
  return {
    cases: cases.length,
    hit1: total ? expectations.filter((layer) => layer.hit1).length / total : 0,
    hit3: total ? expectations.filter((layer) => layer.hit3).length / total : 0,
    forbidViolations: perCase.reduce((sum, testCase) => sum + testCase.forbidViolations, 0),
    perCase,
  };
}
