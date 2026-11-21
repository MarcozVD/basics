import { rng } from "./common.mjs";

export function describe(values) {
  if (!values.length) return null;
  if (!values.every(Number.isFinite)) throw new Error("Statistics require finite observations");
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return {
    count: values.length,
    mean,
    stddev: Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}
/** Exact sign-permutation distribution of midranks, including ties; zero_method=wilcox. */
export function wilcoxon(differences) {
  if (!differences.every(Number.isFinite)) throw new Error("Wilcoxon requires finite paired differences");
  const nonzero = differences
    .map((value) => Number(value.toFixed(12)))
    .filter((value) => value !== 0)
    .sort((a, b) => Math.abs(a) - Math.abs(b));
  if (nonzero.length > 50) throw new Error("Exact study inference supports at most 50 independent tasks");
  const ranks = [];
  for (let start = 0; start < nonzero.length; ) {
    let end = start + 1;
    while (end < nonzero.length && Math.abs(nonzero[end]) === Math.abs(nonzero[start])) end++;
    for (let i = start; i < end; i++) ranks[i] = start + 1 + end;
    start = end;
  }
  const total = ranks.reduce((sum, rank) => sum + rank, 0),
    positive = ranks.reduce((sum, rank, i) => sum + (nonzero[i] > 0 ? rank : 0), 0),
    observed = Math.min(positive, total - positive);
  let distribution = [1];
  for (const rank of ranks) {
    const next = Array(distribution.length + rank).fill(0);
    for (let value = 0; value < distribution.length; value++) {
      next[value] += distribution[value];
      next[value + rank] += distribution[value];
    }
    distribution = next;
  }
  const extreme = distribution.reduce((sum, count, value) => sum + (Math.min(value, total - value) <= observed ? count : 0), 0);
  return {
    statistic: observed / 2,
    pvalue: extreme / 2 ** nonzero.length,
    pairs: differences.length,
    nonzero: nonzero.length,
    method: "exact-sign-permutation-midrank",
    degenerate: nonzero.length === 0,
  };
}
export function bootstrapMean(differences, { seed = "study", resamples = 10000 } = {}) {
  if (!differences.length) return null;
  if (!differences.every(Number.isFinite) || !Number.isSafeInteger(resamples) || resamples < 100)
    throw new Error("Invalid bootstrap input");
  const random = rng(seed),
    distribution = [];
  for (let sample = 0; sample < resamples; sample++) {
    let sum = 0;
    for (let i = 0; i < differences.length; i++) sum += differences[Math.floor(random() * differences.length)];
    distribution.push(sum / differences.length);
  }
  distribution.sort((a, b) => a - b);
  return {
    mean: describe(differences).mean,
    low: distribution[Math.floor((resamples - 1) * 0.025)],
    high: distribution[Math.ceil((resamples - 1) * 0.975)],
    confidence: 0.95,
    resamples,
    seed,
    unit: "task cluster",
    method: "percentile",
    degenerate: differences.every((value) => value === differences[0]),
  };
}
export function holm(pvalues) {
  if (pvalues.some((value) => value !== null && (!Number.isFinite(value) || value < 0 || value > 1)))
    throw new Error("Invalid primary p-value");
  const ordered = pvalues.map((value, index) => ({ value: value ?? 1, index })).sort((a, b) => a.value - b.value || a.index - b.index);
  const adjusted = [];
  let previous = 0;
  for (let rank = 0; rank < ordered.length; rank++) {
    const entry = ordered[rank];
    previous = Math.max(previous, Math.min(1, entry.value * (ordered.length - rank)));
    adjusted[entry.index] = pvalues[entry.index] === null ? null : previous;
  }
  return adjusted;
}
