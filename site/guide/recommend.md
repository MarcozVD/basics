# Recommend

```bash
basics recommend "REST API without SEO, in TypeScript"
basics recommend "REST API to serve ML models" --json
```

`recommend` ranks the tech notes of each layer against a project description. The output shows the score and its
breakdown:

```
backend
  fastapi                  3  kw=5 sem=— neg=0 lang=-2
      use: async REST or JSON API
```

| Part | Meaning |
| --- | --- |
| `kw` | keyword score: `use_when`, `performs_best` and tags matched against the description |
| `sem` | semantic similarity; `—` when embeddings are off |
| `neg` | adjustment for negations |
| `lang` | language boost or penalty |

Profiles whose description matches are returned too, which is why the same description can suggest a whole stack. The
MCP tool `recommend_stack` returns the same ranking; the **Recommend** screen renders it.

## Keyword scoring

- Positive terms in `use_when` and `performs_best` add points; tags also count.
- Negations are understood in English and Spanish: `without SSR`, `no UI`, `avoid SSR`, `sin SEO`, `no UI`,
  `evitar SSR`. The negated clause adds nothing for its positive terms, a matching `use_when` subtracts points, and a
  matching `avoid_when` adds them.
- Naming a language (`in TypeScript`, `en TypeScript`) boosts techs written in that language and lowers same-layer
  techs written in another one.

Scores are relative to your own notes; exact values are not part of the stable API (see [Stability](./stability.md)).

## Embeddings (opt-in)

Keywords are the default. Semantic search is off until you enable it, and **nothing is downloaded before that**.

```bash
basics embeddings enable              # asks for confirmation; --yes skips it
basics embeddings status              # config, runtime, model cache, index state
basics embeddings reindex             # sync the index with the vault
basics embeddings reindex --full      # re-embed every note
basics embeddings disable             # turn it off, keep the downloaded files
basics embeddings disable --purge     # also delete runtime and model cache
```

`enable` downloads about 375 MB of runtime (`@huggingface/transformers` + `onnxruntime`) plus the model
`Xenova/multilingual-e5-small` (about 130 MB): roughly 500 MB in `BASICS_CACHE` or `~/.cache/basics`. Without a
terminal and without `--yes`, the command aborts.

The index lives in `<vault>/.basics/embeddings.json` and `embeddings.bin`. Only notes changed since the last sync are
re-embedded, deleted notes leave the index, and changing the model rebuilds it.

With embeddings on, `basics recommend`, `recommend_stack` and the Recommend screen use **hybrid** mode: keyword and
semantic scores are normalized per layer and fused, and the displayed score is the hybrid one. The UI shows the active
mode, **Keywords** or **Hybrid**.

The model is configurable with `embeddingsModel` (default `Xenova/multilingual-e5-small`).

## Evaluating the ranking

From the repo, over the official packs:

```bash
npm run eval                        # keywords: hit@1, hit@3, forbid violations
npm run eval -- --hybrid            # hybrid score (requires `basics embeddings enable` first)
npm run eval -- --hybrid --grid     # sweep the hybrid weights (w, θ, μ)
npm run eval -- --json              # raw JSON result
```

Run the eval after changing a pack or touching the scoring code; `forbid` violations mean a `avoid_when` was recommended
anyway.
