import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, vi } from "vitest";
import * as runtime from "../src/embeddings-runtime.js";
import { createApp } from "../src/server/app.js";

// Never download the real runtime or model in tests: everything behind
// embeddings enable is replaced with a deterministic in-memory embedder.
vi.mock("../src/embeddings-runtime.js", () => ({
  RUNTIME_PACKAGE: "@huggingface/transformers",
  runtimeDir: () => "/tmp/basics-runtime",
  modelsDir: () => "/tmp/basics-models",
  cacheDir: () => "/tmp/basics-cache",
  runtimeInstalled: () => true,
  modelCached: () => true,
  installRuntime: async () => {},
  loadRuntime: vi.fn(async () => ({ pipeline: async () => undefined })),
  createEmbedder: vi.fn(async () => ({
    model: "Xenova/multilingual-e5-small",
    dim: 3,
    embed: async (texts: string[]) => texts.map(() => Float32Array.from([1, 0, 0])),
  })),
}));

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");
const HOST = { host: "localhost:4747" };

function jsonInit(body: unknown): RequestInit {
  return { method: "POST", headers: { ...HOST, "content-type": "application/json" }, body: JSON.stringify(body) };
}

function withVault(run: (vaultDir: string, configFile: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-enable-"));
  const vaultDir = path.join(dir, "vault");
  const configFile = path.join(dir, "config.json");
  fs.cpSync(SEED, vaultDir, { recursive: true });
  fs.writeFileSync(configFile, JSON.stringify({ vault: vaultDir, language: "en" }));
  const previous = process.env.BASICS_CONFIG;
  process.env.BASICS_CONFIG = configFile;
  return run(vaultDir, configFile).finally(() => {
    if (previous === undefined) delete process.env.BASICS_CONFIG;
    else process.env.BASICS_CONFIG = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });
}

test("GET /api/embeddings reports the model download estimate", async () => {
  await withVault(async (vaultDir) => {
    const app = createApp({ root: vaultDir });
    const res = await app.request("/api/embeddings", { headers: HOST });
    assert.equal(res.status, 200);
    const body = (await res.json()) as { download: { runtime: number; model: number; total: number } };
    assert.deepEqual(body.download, {
      runtime: 375 * 1024 * 1024,
      model: 130 * 1024 * 1024,
      total: 505 * 1024 * 1024,
    });
  });
});

test("POST /api/embeddings/enable switches the next recommendation to hybrid", async () => {
  await withVault(async (vaultDir, configFile) => {
    const app = createApp({ root: vaultDir });
    const before = await (await app.request("/api/recommend", jsonInit({ description: "REST API in Python" }))).json();
    assert.equal((before as { mode: string }).mode, "keywords");

    const res = await app.request("/api/embeddings/enable", jsonInit({}));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { enabled: boolean; model: string; indexed: number };
    assert.equal(body.enabled, true);
    assert.equal(body.model, "Xenova/multilingual-e5-small");
    assert.ok(body.indexed > 0);

    const config = JSON.parse(fs.readFileSync(configFile, "utf8")) as { embeddings: boolean };
    assert.equal(config.embeddings, true);

    const after = await (await app.request("/api/recommend", jsonInit({ description: "REST API in Python" }))).json();
    assert.equal((after as { mode: string }).mode, "hybrid");
  });
});

test("POST /api/embeddings/enable reports a clear error when the runtime is absent", async () => {
  await withVault(async (vaultDir, configFile) => {
    vi.mocked(runtime.loadRuntime).mockResolvedValueOnce(null);
    const app = createApp({ root: vaultDir });
    const res = await app.request("/api/embeddings/enable", jsonInit({}));
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string; message: string };
    assert.equal(body.error, "internal");
    assert.match(body.message, /runtime missing/);

    const config = JSON.parse(fs.readFileSync(configFile, "utf8")) as { embeddings?: boolean };
    assert.equal(config.embeddings ?? false, false);
  });
});

test("POST /api/embeddings/enable rejects a non-local origin", async () => {
  await withVault(async (vaultDir) => {
    const app = createApp({ root: vaultDir });
    const res = await app.request("/api/embeddings/enable", {
      method: "POST",
      headers: { ...HOST, "content-type": "application/json", origin: "https://evil.com" },
      body: "{}",
    });
    assert.equal(res.status, 403);
  });
});

test("POST /api/embeddings/enable retries a failed model load once, then succeeds", async () => {
  vi.mocked(runtime.createEmbedder).mockRejectedValueOnce(new Error("Unable to get model file path or buffer."));
  await withVault(async (vaultDir, configFile) => {
    const app = createApp({ root: vaultDir });
    const res = await app.request("/api/embeddings/enable", jsonInit({}));
    assert.equal(res.status, 200);
    const body = (await res.json()) as { enabled: boolean };
    assert.equal(body.enabled, true);
    assert.equal(vi.mocked(runtime.createEmbedder).mock.calls.length, 2);
    const config = JSON.parse(fs.readFileSync(configFile, "utf8")) as { embeddings: boolean };
    assert.equal(config.embeddings, true);
  });
});

test("POST /api/embeddings/enable reports a readable message and never saves the config when the model cannot load", async () => {
  vi.mocked(runtime.createEmbedder)
    .mockRejectedValueOnce(new Error("Unable to get model file path or buffer."))
    .mockRejectedValueOnce(new Error("Unable to get model file path or buffer."));
  await withVault(async (vaultDir, configFile) => {
    const app = createApp({ root: vaultDir });
    const res = await app.request("/api/embeddings/enable", jsonInit({}));
    assert.equal(res.status, 500);
    const body = (await res.json()) as { error: string; message: string };
    assert.equal(body.error, "internal");
    assert.equal(
      body.message,
      "Could not download the model (Unable to get model file path or buffer.). Check your connection and try again.",
    );
    const config = JSON.parse(fs.readFileSync(configFile, "utf8")) as { embeddings?: boolean };
    assert.notEqual(config.embeddings, true);
  });
});
