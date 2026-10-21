import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { Embedder } from "@marcozvd/basics-core";

const RUNTIME_PACKAGE = "@huggingface/transformers";
const RUNTIME_VERSION = "3";

interface TensorLike {
  data: Float32Array | number[];
  dims: number[];
}

type FeatureExtractor = (texts: string[], options?: { pooling?: string; normalize?: boolean }) => Promise<TensorLike>;

export interface TransformersModule {
  env?: { cacheDir?: string };
  pipeline(task: string, model: string, options?: { dtype?: string }): Promise<FeatureExtractor>;
}

export function cacheDir(): string {
  return process.env.BASICS_CACHE ?? path.join(os.homedir(), ".cache", "basics");
}

export function runtimeDir(): string {
  return path.join(cacheDir(), "embeddings");
}

export function modelsDir(): string {
  return path.join(cacheDir(), "models");
}

export function runtimeInstalled(): boolean {
  return fs.existsSync(path.join(runtimeDir(), "node_modules", ...RUNTIME_PACKAGE.split("/"), "package.json"));
}

/** Model files may live as `<org>/<name>` or in a `models--org--name` hub folder. */
export function modelCached(model: string): boolean {
  const cache = modelsDir();
  if (!fs.existsSync(cache)) return false;
  const direct = path.join(cache, ...model.split("/"));
  const hub = path.join(cache, `models--${model.split("/").join("--")}`);
  return fs.existsSync(direct) || fs.existsSync(hub);
}

export function directorySize(dir: string): number {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return total + directorySize(full);
    try {
      return total + fs.statSync(full).size;
    } catch {
      return total;
    }
  }, 0);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Install the opt-in runtime next to the cache, not in the user's project. */
export function installRuntime(): Promise<void> {
  fs.mkdirSync(runtimeDir(), { recursive: true });
  const args = ["install", "--prefix", runtimeDir(), "--no-save", "--no-audit", "--no-fund", `${RUNTIME_PACKAGE}@${RUNTIME_VERSION}`];
  console.log(`Installing embeddings runtime (${RUNTIME_PACKAGE}@${RUNTIME_VERSION}) in ${runtimeDir()}`);
  console.log(`> npm ${args.join(" ")}`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, {
      shell: process.platform === "win32",
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        console.log(`Embeddings runtime installed in ${runtimeDir()}`);
        resolve();
      } else {
        reject(new Error(`npm install failed with exit code ${code ?? "unknown"}`));
      }
    });
  });
}

/** Import the runtime from the cache. Null means `embeddings enable` has not run yet. */
export async function loadRuntime(): Promise<TransformersModule | null> {
  const dir = path.join(runtimeDir(), "node_modules", ...RUNTIME_PACKAGE.split("/"));
  const manifest = path.join(dir, "package.json");
  if (!fs.existsSync(manifest)) return null;
  const pkg = JSON.parse(fs.readFileSync(manifest, "utf8")) as { module?: string; main?: string };
  const entry = path.join(dir, pkg.module ?? pkg.main ?? "dist/transformers.js");
  const loaded = (await import(pathToFileURL(entry).href)) as TransformersModule & { default?: TransformersModule };
  return loaded.default?.pipeline ? loaded.default : loaded;
}

/** Mean-pooled, normalized e5 embeddings with the required query/passage prefixes. */
export async function createEmbedder(runtime: TransformersModule, model: string): Promise<Embedder> {
  if (runtime.env) runtime.env.cacheDir = modelsDir();
  const extractor = await runtime.pipeline("feature-extraction", model, { dtype: "q8" });
  const probe = await extractor(["passage: probe"], { pooling: "mean", normalize: true });
  const dim = probe.dims[probe.dims.length - 1] ?? 0;
  if (!dim) throw new Error(`could not determine embedding dimension for ${model}`);

  return {
    model,
    dim,
    async embed(texts: string[], kind: "query" | "passage"): Promise<Float32Array[]> {
      if (!texts.length) return [];
      const output = await extractor(
        texts.map((text) => `${kind}: ${text}`),
        { pooling: "mean", normalize: true },
      );
      const flat = output.data instanceof Float32Array ? output.data : Float32Array.from(output.data);
      const vectors: Float32Array[] = [];
      for (let i = 0; i < texts.length; i++) vectors.push(flat.slice(i * dim, (i + 1) * dim));
      return vectors;
    },
  };
}
