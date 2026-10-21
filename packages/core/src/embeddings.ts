/** Text embedder used by the opt-in vector index. Core stays free of runtime dependencies. */
export interface Embedder {
  model: string;
  dim: number;
  embed(texts: string[], kind: "query" | "passage"): Promise<Float32Array[]>;
}
