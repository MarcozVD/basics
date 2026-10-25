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

Profiles whose description matches are returned too, which is why the same description can suggest a whole stack. A
layer with no candidate above zero is omitted from the output — the CLI prints no section for it, `recommend_stack`
leaves it out of `layers` (the core response still returns it as an empty list, for a stable API), and the **Recommend**
screen renders no column for it. When every requested layer is empty, the screen shows one quiet message instead.

The MCP tool `recommend_stack` returns the same ranking; the **Recommend** screen renders it.

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

The **Recommend** screen shows the active mode as a badge next to the title, **Keywords** or **Hybrid**. While
keywords are active, a **Turn on semantic matching** action sits next to that badge: it explains the one-time
download (the configured model, about 130 MB, plus the ~375 MB runtime) and then performs the same steps as
`basics embeddings enable`, with live progress from the server. When it finishes, the current description is
re-ranked and the badge switches to **Hybrid**. If the runtime cannot be installed or loaded, the action shows a
clear error and the mode stays **Keywords**.

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

`npm run eval -- --realistic` runs the same checks against a larger fixture vault written like a real one (many
notes with only tags and a short body). Both suites guard against regressions while the scoring changes; they are not
an accuracy promise for your vault, which depends on how much `use_when`, tags and text your notes have. The
**hybrid** numbers require the embeddings runtime, so `npm run eval -- --hybrid` only runs after
`basics embeddings enable` (or the **Turn on semantic matching** button) has installed it.
