import {
  type Embedder,
  loadConfig,
  loadIndex,
  type Recommendation,
  type RecommendOptions,
  recommend,
  recommendHybrid,
  syncIndex,
  type Vault,
} from "@marcozvd/basics-core";
import { createEmbedder, loadRuntime } from "./embeddings-runtime.js";

export type Recommender = (description: string, opts?: RecommendOptions) => Promise<Recommendation>;

let cached: { model: string; embedder: Promise<Embedder | null> } | undefined;

/** Load the runtime and model once per process; null means embeddings stay off. */
function embedderFor(model: string): Promise<Embedder | null> {
  if (cached?.model !== model) {
    cached = {
      model,
      embedder: loadRuntime()
        .then((runtime) => (runtime ? createEmbedder(runtime, model) : null))
        .catch(() => null),
    };
  }
  return cached.embedder;
}

/**
 * Hybrid when embeddings are enabled and usable, keyword otherwise. A hybrid recommender
 * refreshes the vector index before ranking, so manual note edits show up immediately.
 */
export async function getRecommender(
  vault: Vault,
  opts: { onProgress?: (done: number, total: number) => void } = {},
): Promise<Recommender> {
  const keywords: Recommender = async (description, recommendOpts) => recommend(vault, description, recommendOpts);
  const cfg = loadConfig();
  if (!cfg.embeddings) return keywords;

  const embedder = await embedderFor(cfg.embeddingsModel);
  if (!embedder) return keywords;

  try {
    const current = loadIndex(vault);
    if (current.model !== embedder.model || current.stale(vault).length > 0) {
      await syncIndex(vault, embedder, opts.onProgress);
    }
  } catch {
    return keywords;
  }

  const index = loadIndex(vault);
  if (!index.notes) return keywords;
  return (description, recommendOpts) => recommendHybrid(vault, description, index, embedder, recommendOpts);
}
