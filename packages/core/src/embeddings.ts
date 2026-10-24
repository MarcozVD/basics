/** Text embedder used by the opt-in vector index. Core stays free of runtime dependencies. */
export interface Embedder {
  model: string;
  dim: number;
  embed(texts: string[], kind: "query" | "passage"): Promise<Float32Array[]>;
}

/**
 * One-time download sizes, in bytes, shown before the user opts in. The runtime is a fixed
 * npm package; the model size is keyed by the configured `embeddingsModel`, with a fallback
 * for models this build has not measured so the UI can still warn about a download.
 */
export const RUNTIME_DOWNLOAD_BYTES = 375 * 1024 * 1024;
export const DEFAULT_MODEL_DOWNLOAD_BYTES = 130 * 1024 * 1024;

const MODEL_DOWNLOAD_BYTES: Record<string, number> = {
  "Xenova/multilingual-e5-small": 130 * 1024 * 1024,
};

export function modelDownloadBytes(model: string): number {
  return MODEL_DOWNLOAD_BYTES[model] ?? DEFAULT_MODEL_DOWNLOAD_BYTES;
}

export interface DownloadSize {
  /** Runtime package (`@huggingface/transformers` + onnxruntime). */
  runtime: number;
  /** Model files for the configured model. */
  model: number;
  total: number;
}

/** Download estimate for a model, derived from the config's model id. */
export function downloadSize(model: string): DownloadSize {
  const bytes = modelDownloadBytes(model);
  return { runtime: RUNTIME_DOWNLOAD_BYTES, model: bytes, total: RUNTIME_DOWNLOAD_BYTES + bytes };
}
