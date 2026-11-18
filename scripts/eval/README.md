# Public repository evaluation

Build first with `npm run build`. Mining reads public metadata and pinned manifest
blobs through authenticated `gh api`. It never executes repository code. The raw
cache is ignored at `scripts/demo/generated/t3/github-raw.json`; preserve that cache
to replay the exact collection. A fresh online run can observe newer commits.

```sh
# Online collection, with a fresh output path for review.
node scripts/eval/mine-github.mjs --pages 3 --out scripts/demo/generated/t3/candidate.json
# Offline replay of the preserved raw cache; no network calls.
node scripts/eval/mine-github.mjs --offline
# Alternate cache/output paths, including review of generator changes.
node scripts/eval/mine-github.mjs --offline --raw path/to/raw.json --out path/to/candidate.json
```

The fixed seed, 70/30 stratified split, repository URLs, commit hashes and manifest
hashes are stored in `github-repos.json`. Existing output is preserved if generated
bytes differ. Review a candidate before explicitly copying it over the published
file. Review membership, descriptions and manifest truth without tuning ranking on
held-out cases. An incomplete cache fails instead of publishing fewer than 150.

`github-quality-labels.json` binds manual audit labels to the dataset SHA-256.
Listed categories are `library`, `example` and `mixed`; all remaining cases are
`app`. Reaudit changed cases and bind the labels to the new hash after promotion.
`node scripts/eval/audit-github.mjs` prints category counts and weak descriptions.
Libraries remain in the full benchmark; apps-only rows supplement it.

```sh
npm run eval -- --record-baseline
npm run eval
```

Baseline recording is an explicit review operation, never a CI repair step. Normal
evaluation gates hit@1, hit@3, MRR, forbidden results, case counts, partitions and
fixture hashes for every recorded row, including apps-only tune and held-out rows.
MRR uses the first relevant candidate across the full positive ranking, averaged
over expected layers. Keywords always run; hybrid also runs when its local runtime
is installed and requires a matching model baseline. Unavailable hybrid is SKIP.

The private set is always SKIP in CI. Locally it can be loaded from
`BASICS_PRIVATE_EVAL` or the private agents directory. Its rows are separately gated
and labeled `other vault, not comparable`; their scores are not comparable to the
public benchmark because the originating vault differs. No raw private data is
published. No network collection runs during evaluation or CI.
