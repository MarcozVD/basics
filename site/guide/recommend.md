# Recommend

```bash
basics recommend "REST API without SEO, in TypeScript"
basics recommend "REST API to serve ML models" --json
```

`recommend` ranks the tech notes of each layer against a project description. The CLI output shows the score and its
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
screen renders no section for it. When every requested layer is empty, the screen shows one quiet message instead.

The MCP tool `recommend_stack` returns the same ranking. The **Recommend** screen shows it as a shortlist without numbers: profiles first, then one section per layer in reading order. Each tech is one card with its title and up to three reason lines:

- **Matches**: the `use_when` and `performs_best` phrases that matched your description.
- **Fits profile**: the profiles above whose stack includes the tech.
- **Watch out**: the note's `avoid_when` phrases that matched, and phrases your description negates, such as *without login* against a note that says *login*.

A tech that fits several layers appears once, under the layer of its note's first `layer`, and **Also fits** names the others. Each card's **Why** lists the score parts: keywords, text, synonyms, semantic (in hybrid mode), negation, language and project history. The order of the cards is the ranking.

## Ask an agent

The ranking above is local. If you would rather have a coding agent of your choice make the call — with its own model
and its own reading of your vault — the **Recommend** screen has an **Ask an agent** action next to **Recommend**.

It opens a compact panel:

| Control | What it does |
| --- | --- |
| **Agent** | The agent CLIs found on this computer: Claude Code, OpenCode or Codex. When none is installed the panel says so and cannot run. |
| **Model** | The models that agent offers, plus **Custom...** for a free model id. Your choice is remembered per agent. |

**Run** starts the chosen CLI headless, in a fresh empty directory, with your account and with no project files to
write. It reads the vault through the Basics MCP server that `basics connect` already registered for it (the panel
hints to **Connect agents** when it cannot tell). The answer streams into the panel as Markdown, where `[[id]]` opens
the note preview. **Cancel** stops a run; the panel shows the elapsed time and, on failure, the last lines of the CLI
output.

When the answer is done, **Select these (n)** adds the tech notes it cited with `[[id]]` to the current selection, so
**Export stack** and **Create project** work as usual. If the agent decided on a technology the vault does not have
yet, it proposes that note to the **Inbox**; the panel lists the proposed ids with a link, and nothing is applied until
you approve it there.

The run belongs to the browser tab, not to the panel. Leaving **Recommend** does not stop it: the sidebar marks
Recommend with a pulsing dot while it streams, and a toast offers **Open Recommend** when it finishes elsewhere.
The answer, the cited ids and the proposals stay when you come back and after a reload. A run cut short by a
reload shows **Interrupted** with **Retry**, which runs the same prompt again. Each tab has at most one agent run;
a run abandoned by a reload is stopped rather than left to finish unattended. **Clear** on Recommend also clears
the agent answer.

Basics only passes the agent the description, the chosen layers and the `plan-stack` prompt; the run uses the same
5-minute limit as `basics` itself. Nothing is downloaded or installed to ask an agent.

## Keyword scoring

- Positive terms in `use_when` and `performs_best` add points; tags also count.
- Negations are understood in English and Spanish: `without SSR`, `no UI`, `avoid SSR`, `sin SEO`, `no UI`,
  `evitar SSR`. The negated clause adds nothing for its positive terms, a matching `use_when` subtracts points, and a
  matching `avoid_when` adds them.
- Naming a language (`in TypeScript`, `en TypeScript`, `in Rust`) boosts the techs written in that language. In each layer
  that has techs in that language, techs written in another language lose their positive score. Layers with no tech in
  that language, such as the frontend when no frontend tech is written in Rust, keep their normal ranking. Techs without a
  language, such as SQLite, stay eligible. If the rule would leave a layer with no match at all, that layer keeps its
  matches without the penalty.
- Naming a technology by its full name also names its language. `FastAPI` implies Python, `Axum` implies Rust, `Gin`
  implies Go, `Flutter` implies Dart, and `Next.js` implies TypeScript. A technology you name stays eligible even when its
  language differs from the other techs in its layer. Names inside a negated phrase, such as `without FastAPI`, imply
  nothing. A partial match does not imply a language: the word `async` does not name AsyncStorage.
- Six ordinary words are also tech names: `poem`, `rocket`, `echo`, `fiber`, `swift` and `next`. Alone, they are ignored as
  tech names and as keyword evidence. They count only with context: a stack word within two words of them, such as `API`,
  `framework`, `library`, `backend`, `package` or `language` (or `servidor`, `paquete`, `biblioteca` or `lenguaje`); a
  language name after `in`, `using`, `en` or `con`, such as `in Swift`; or a platform word (`iOS`, `macOS`, `Apple` or
  `Xcode`) that the vault's notes for that language mention. `Next.js` always counts, because its full name is distinctive.

Scores are relative to your own notes; exact values are not part of the stable API (see [Stability](./stability.md)). The Recommend screen shows them only under each card's **Why**.

## Project history

Finished projects nudge the ranking a little. A project note can say how it went with an `outcome` field: `successful`, `failed` or `abandoned`. A project with status **Done** and no outcome counts as successful. Active, paused and archived projects without an outcome count for nothing. An outcome counts whatever the status is, but only after you approve the proposal that records it, so a pending proposal changes nothing (see [Projects and checks](./projects-and-checks.md#project-notes)).

Each project votes once for every tech in its stack: +1 if it succeeded, -1 if it failed or was abandoned. A tech listed in several layers still gets one vote per project. A tech's votes add up and are capped at +1 or -1, so ten successful projects nudge a tech no more than one does, and a success cancels out a failure.

The nudge is a share of the top score in the tech's layer, rounded to whole points:

| Weight | Largest nudge |
| --- | --- |
| `0` | none, history is off |
| `1` (default) | 10% of the layer's top score |
| `3` (maximum) | 30% of the layer's top score |

Say the top tech in a layer scores 40. At the default weight, a tech with successful projects gets +4 and a tech with failed projects gets -4. At weight 3 those become +12 and -12.

In plain words, history nudges close calls and does not override clear matches:

- It applies only to techs that already match your description by words or synonyms. It never recommends a tech on history alone.
- It is off in each layer that holds a tech or language you name, such as `using TypeScript`. Those layers keep their normal ranking.
- It is off for techs that get a language penalty, and for techs whose match your description negates.
- Its effect is bounded. At the default weight it can change the order only between techs whose keyword scores are within about 20% of the layer's top score. At weight 3 that window is about 60%.

The **Recommend** screen shows a **project history** row under each card's **Why**. When projects stand behind it, the card lists each one with its outcome, its vote and a link to the project note. Over MCP, `recommend_stack` adds `history` to a candidate's `score_breakdown` and a `history_projects` list with each project's `id`, `title`, `outcome` and `contribution` (`1` or `-1`). Both are left out when the history is zero. The CLI line prints only `kw`, `sem`, `neg` and `lang`, but its total includes history.

Turn history off, or change its strength, in **Settings → Search**: the **Use project history** switch saves at once, and the **History strength** field takes a number from 0 to 3 and saves when you press Enter or leave the field. The values are stored for this vault in `.basics/config.json`:

```json
{ "history": { "enabled": true, "weight": 1 } }
```

Setting `enabled` to `false`, or `weight` to `0`, turns history off.

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

The same switch is in **Settings → Search** in the web UI, which also shows the one-time download size and the index
counts. Turning it off there keeps the downloaded files, as `basics embeddings disable` does without `--purge`.

`enable` downloads about 375 MB of runtime (`@huggingface/transformers` + `onnxruntime`) plus the model
`Xenova/multilingual-e5-small` (about 130 MB): roughly 500 MB in `BASICS_CACHE` or `~/.cache/basics`. Without a
terminal and without `--yes`, the command aborts.

The index lives in `<vault>/.basics/embeddings.json` and `embeddings.bin`. Only notes changed since the last sync are
re-embedded, deleted notes leave the index, and changing the model rebuilds it.

With embeddings on, `basics recommend`, `recommend_stack` and the Recommend screen use **hybrid** mode: keyword and
semantic scores are normalized per layer and fused, and the scores shown are the hybrid ones. The UI shows the active
mode, **Keywords** or **Hybrid**. In hybrid mode a card's **Why** adds a **semantic** row.

The model is configurable with `embeddingsModel` (default `Xenova/multilingual-e5-small`).

## Evaluating the ranking

The eval checks the ranking against labelled cases from the repo. It runs four sets:

- **Official keyword cases**: 72 cases written against the official packs.
- **Realistic fixture vault**: 25 cases on a larger vault written like a real one (`npm run eval -- --realistic`).
- **Public GitHub repositories**: 150 repositories, each with its description and the technologies its manifests use.
  105 cases tune the ranking and 45 are held out. Held-out cases are never used for tuning. Libraries, examples and mixed
  repositories stay in the full set. The apps-only rows (76 cases, 53 tune and 23 held out) measure applications alone.
- **Private set**: runs only on a maintainer's machine, from `BASICS_PRIVATE_EVAL`. CI always skips it, and its numbers
  are not comparable with the public sets.

The recorded baseline for the held-out GitHub cases, keywords only, is hit@1 0.173, hit@3 0.299 and MRR 0.257. These
numbers are low. They are a baseline, not a target: they show where the ranking stands today, so a change that makes it
worse fails the eval. They do not say how well the ranking works for your vault.

```bash
npm run eval                        # every set, gated against scripts/eval/baseline.json
npm run eval -- --hybrid            # hybrid score (requires `basics embeddings enable` first)
npm run eval -- --hybrid --grid     # sweep the hybrid weights (w, θ, μ)
npm run eval -- --json              # raw JSON result
npm run eval -- --record-baseline   # contributors only: record a new baseline after review
```

CI runs `npm run eval` on every change. It fails when a gated metric drops below the recorded baseline: hit@1, hit@3, MRR,
forbidden results, case counts, split membership or fixture hashes. Recording a baseline is a review step, never a CI
repair step. Hybrid runs only when the embeddings runtime is installed; CI reports it as skipped otherwise. Run the eval
after changing a pack or touching the scoring code; `forbid` violations mean an `avoid_when` was recommended anyway.

The sets guard against regressions while the scoring changes; they are not an accuracy promise for your vault, which
depends on how much `use_when`, tags and text your notes have. The **hybrid** numbers require the embeddings runtime, so
`npm run eval -- --hybrid` only runs after `basics embeddings enable` (or the **Turn on semantic matching** button) has
installed it.
