export function summarize(entries) {
  const layers = entries.flatMap((entry) => entry.layers);
  const total = layers.length;
  return {
    cases: entries.length,
    expectations: total,
    hit1: total ? layers.filter((r) => r.hit1).length / total : 0,
    hit3: total ? layers.filter((r) => r.hit3).length / total : 0,
    mrr: total ? layers.reduce((sum, r) => sum + r.reciprocalRank, 0) / total : 0,
    forbid: entries.reduce((sum, r) => sum + r.forbidViolations, 0),
  };
}
export function metricRows(name, mode, entries) {
  const groups = new Map([["all", entries]]);
  for (const split of [...new Set(entries.map((r) => r.split).filter(Boolean))])
    groups.set(
      split,
      entries.filter((r) => r.split === split),
    );
  for (const [label, indirect] of [
    ["indirect", true],
    ["direct", false],
  ]) {
    const selected = entries.filter((r) => r.indirect === indirect);
    if (selected.length) groups.set(label, selected);
  }
  // Audit categories supplement the full corpus; they never remove its cases.
  if (entries.some((entry) => entry.category !== undefined)) {
    for (const split of ["all", ...new Set(entries.map((entry) => entry.split).filter(Boolean))])
      groups.set(
        `apps-only/${split}`,
        entries.filter((entry) => entry.category === "app" && (split === "all" || entry.split === split)),
      );
  }
  return [...groups].map(([split, values]) => ({ set: name, mode, split, ...summarize(values) }));
}
export const rowKey = (row) => `${row.mode}/${row.set}/${row.split}`;
export function regressions(rows, baseline, fingerprints, model) {
  const failures = [];
  for (const [name, fingerprint] of Object.entries(fingerprints))
    if (baseline.fingerprints[name] !== fingerprint) failures.push(`${name}: fixture fingerprint changed; baseline is not comparable`);
  if (rows.some((r) => r.mode === "hybrid") && baseline.hybrid_model !== model)
    failures.push("hybrid model differs from the recorded baseline");
  for (const row of rows) {
    const old = baseline.rows[rowKey(row)];
    if (!old) {
      failures.push(`${rowKey(row)}: no recorded baseline`);
      continue;
    }
    if (row.cases !== old.cases || row.expectations !== old.expectations) failures.push(`${rowKey(row)}: case/layer count changed`);
    for (const metric of ["hit1", "hit3", "mrr"]) {
      if (![row[metric], old[metric]].every((value) => Number.isFinite(value) && value >= 0 && value <= 1))
        failures.push(`${rowKey(row)} ${metric}: missing/invalid metric`);
      else if (row[metric] + 1e-12 < old[metric]) failures.push(`${rowKey(row)} ${metric}: ${row[metric]} < ${old[metric]}`);
    }
    if (row.forbid > old.forbid) failures.push(`${rowKey(row)} forbid: ${row.forbid} > ${old.forbid}`);
  }
  for (const key of Object.keys(baseline.rows)) {
    const [mode, name] = key.split("/");
    if (fingerprints[name] && rows.some((r) => r.mode === mode) && !rows.some((r) => rowKey(r) === key))
      failures.push(`${key}: baseline partition disappeared`);
  }
  return failures;
}
