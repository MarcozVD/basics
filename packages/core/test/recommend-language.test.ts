import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { type Embedder, installPack, listPacks, loadIndex, recommend, recommendHybrid, syncIndex, Vault } from "../src/index.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-language-"));
  const vault = Vault.load(root);
  for (const layer of ["backend", "data", "testing"]) {
    vault.writeNote(layer, { type: "layer", tags: [], source: "manual" }, "");
  }
  for (const language of ["rust", "go", "dart", "kotlin", "swift", "python"]) {
    vault.writeNote(
      language,
      {
        type: "tech",
        kind: "language",
        title: language === "go" ? "Go (Golang)" : language,
        layer: "backend",
        tags: [],
        source: "manual",
      },
      "",
    );
    for (const layer of ["backend", "data", "testing"]) {
      vault.writeNote(
        `${language}-${layer}`,
        {
          type: "tech",
          kind: "library",
          layer,
          language,
          use_when: [language === "python" ? "HTTP JSON validation async API service tests unit integration" : "HTTP API"],
          tags: [],
          source: "manual",
        },
        "",
      );
    }
  }
  vault.writeNote(
    "neutral-db",
    {
      type: "tech",
      kind: "database",
      layer: "data",
      use_when: ["HTTP"],
      tags: [],
      source: "manual",
    },
    "",
  );
  return { vault, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("explicit language mentions constrain implementation tools in every layer, in en and es", () => {
  const { vault, cleanup } = fixture();
  try {
    for (const language of ["rust", "go", "dart", "kotlin", "swift"]) {
      for (const description of [
        `${language} HTTP JSON validation async API service tests unit integration`,
        `Servicio HTTP API en ${language} con JSON y pruebas unit integration`,
      ]) {
        const result = recommend(vault, description);
        const all = recommend(vault, description, { includeUnscored: true, perLayer: 100 });
        assert.equal(all.layers.backend.find((candidate) => candidate.id === language)?.score_breakdown.language, 0);
        for (const layer of ["backend", "data", "testing"]) {
          assert.equal(result.layers[layer][0]?.id, `${language}-${layer}`);
          assert.equal(result.layers[layer][0]?.score_breakdown.language, 3);
          assert.equal(
            result.layers[layer].some((candidate) => candidate.id === `python-${layer}`),
            false,
          );
          const foreign = all.layers[layer].find((candidate) => candidate.id === `python-${layer}`);
          assert.ok(foreign && foreign.score_breakdown.language < 0 && foreign.score <= 0);
        }
        assert.ok(result.layers.data.some((candidate) => candidate.id === "neutral-db"));
      }
    }
    assert.equal(recommend(vault, "Golang HTTP API").layers.backend[0]?.id, "go-backend");
  } finally {
    cleanup();
  }
});

test.each(["en", "es"])("named frameworks infer their language for keyword and hybrid recommendations (%s)", async (lang) => {
  const packs = path.resolve(import.meta.dirname, "../../../packs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-named-language-"));
  const embedder: Embedder = {
    model: "named-language-test",
    dim: 2,
    async embed(texts) {
      return texts.map(() => Float32Array.from([1, 0]));
    },
  };
  try {
    const vault = Vault.load(root);
    for (const pack of listPacks(packs)) installPack(vault, packs, pack.name, { lang });
    await syncIndex(vault, embedder);
    const index = loadIndex(vault);
    const cases =
      lang === "en"
        ? [
            ["FastAPI API serving machine learning models over HTTP", "backend", "python"],
            ["Axum HTTP API with JSON validation and cargo tests", "backend", "rust"],
            ["Gin HTTP API with JSON endpoints and PostgreSQL", "backend", "go"],
            ["Flutter mobile app with offline records", "mobile", "dart"],
            ["Next.js web with SEO and server-side rendering", "frontend", "typescript"],
          ]
        : [
            ["API FastAPI que sirve modelos de machine learning por HTTP", "backend", "python"],
            ["API HTTP Axum con validación JSON y pruebas cargo", "backend", "rust"],
            ["API HTTP Gin con JSON y PostgreSQL", "backend", "go"],
            ["App móvil Flutter con registros offline", "mobile", "dart"],
            ["Web Next.js con SEO y renderizado de servidor", "frontend", "typescript"],
          ];
    for (const [query, layer, language] of cases) {
      const keyword = recommend(vault, query, { perLayer: 100 });
      const hybrid = await recommendHybrid(vault, query, index, embedder, { weight: 0, perLayer: 100 });
      for (const result of [keyword, hybrid]) {
        const first = vault.get(result.layers[layer][0]?.id);
        assert.ok(first?.data.type === "tech");
        assert.equal(first.data.language, language, query);
        assert.equal(result.layers[layer][0]?.language_boost, 3, query);
        if (query.includes("FastAPI")) {
          assert.equal(result.layers.backend[0]?.id, "fastapi");
          assert.equal(result.layers.testing[0]?.id, "pytest");
          assert.equal(
            result.layers.backend.some((candidate) => candidate.id === "net-http"),
            false,
          );
          assert.equal(
            result.layers.testing.some((candidate) => ["httptest", "wiremock-rs"].includes(candidate.id)),
            false,
          );
        }
      }
    }
    const mixed =
      lang === "en"
        ? ["FastAPI API with React frontend and dashboard", "Go HTTP API with Flutter mobile app"]
        : ["API FastAPI con frontend React y dashboard", "API HTTP Go con app móvil Flutter"];
    for (const query of mixed) {
      for (const result of [recommend(vault, query), await recommendHybrid(vault, query, index, embedder, { weight: 0 })]) {
        if (query.includes("FastAPI")) {
          assert.equal(result.layers.backend[0]?.id, "fastapi");
          assert.equal(result.layers.frontend[0]?.id, "react");
        } else {
          const first = vault.get(result.layers.backend[0]?.id);
          assert.ok(first?.data.type === "tech" && first.data.language === "go");
          assert.equal(result.layers.mobile[0]?.id, "flutter");
        }
      }
    }
    const neutral = recommend(
      vault,
      lang === "en" ? "FastAPI API with PostgreSQL transactions" : "API FastAPI con transacciones PostgreSQL",
    );
    assert.ok(neutral.layers.data.some((candidate) => candidate.id === "postgresql"));
    assert.equal(neutral.layers.data.find((candidate) => candidate.id === "postgresql")?.language_boost, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("package names infer languages without partial-name or negated-name inference", () => {
  const { vault, cleanup } = fixture();
  try {
    vault.writeNote(
      "model-engine",
      {
        type: "tech",
        kind: "library",
        title: "Tensor Engine",
        layer: "backend",
        language: "rust",
        packages: { pypi: ["tensor-engine"] },
        use_when: ["HTTP API"],
        source: "manual",
      },
      "",
    );
    for (const query of ["tensor-engine HTTP API", "Tensor Engine HTTP API", "model-engine HTTP API"]) {
      const result = recommend(vault, query, { perLayer: 100 });
      assert.equal(result.layers.testing[0]?.id, "rust-testing", query);
      assert.equal(
        result.layers.testing.some((candidate) => candidate.id === "python-testing"),
        false,
      );
    }
    vault.writeNote(
      "document-store",
      {
        type: "tech",
        kind: "library",
        title: "Document Store",
        layer: "data",
        language: "go",
        packages: { pypi: ["documentstore"] },
        source: "manual",
      },
      "",
    );
    assert.equal(recommend(vault, "documentstore HTTP API").layers.testing[0]?.id, "go-testing");
    vault.writeNote(
      "async-storage",
      { type: "tech", kind: "library", title: "AsyncStorage", layer: "data", language: "go", source: "manual" },
      "",
    );
    for (const query of [
      "HTTP API engine",
      "HTTP API async",
      "HTTP API documentstor",
      "HTTP API without tensor-engine",
      "API HTTP sin Tensor Engine",
    ]) {
      const result = recommend(vault, query, { perLayer: 100 });
      assert.ok(
        Object.values(result.layers)
          .flat()
          .every((candidate) => candidate.language_boost === 0),
        query,
      );
    }
  } finally {
    cleanup();
  }
});

test("multiple languages, explicit integrations and neutral or negated requests remain eligible", () => {
  const { vault, cleanup } = fixture();
  try {
    const mixed = recommend(vault, "Rust and Python HTTP API", { perLayer: 100 });
    assert.deepEqual(mixed.layers.backend.map((candidate) => candidate.id).sort(), ["python-backend", "rust-backend"]);
    const integration = recommend(vault, "Rust HTTP API with python-testing", { perLayer: 100 });
    assert.ok(integration.layers.testing.some((candidate) => candidate.id === "python-testing"));
    for (const description of ["HTTP API", "HTTP API without Rust", "API HTTP sin Rust"]) {
      const result = recommend(vault, description, { perLayer: 100 });
      assert.ok(result.layers.testing.some((candidate) => candidate.id === "python-testing"));
      assert.ok(
        Object.values(result.layers)
          .flat()
          .every((candidate) => candidate.language_boost === 0),
      );
    }
  } finally {
    cleanup();
  }
});

test("semantic-only matches cannot restore an incompatible language", async () => {
  const { vault, cleanup } = fixture();
  const embedder: Embedder = {
    model: "language-test",
    dim: 2,
    async embed(texts) {
      return texts.map(() => Float32Array.from([1, 0]));
    },
  };
  try {
    await syncIndex(vault, embedder);
    const result = await recommendHybrid(vault, "Rust HTTP API", loadIndex(vault), embedder, { weight: 0, perLayer: 100 });
    for (const [layer, candidates] of Object.entries(result.layers)) {
      assert.ok(candidates.some((candidate) => candidate.id === `rust-${layer}`));
      assert.equal(
        candidates.some((candidate) => candidate.id === `python-${layer}`),
        false,
      );
    }
    assert.ok(result.layers.data.some((candidate) => candidate.id === "neutral-db"));
  } finally {
    cleanup();
  }
});

test("mixed APIs preserve web frontend candidates in keyword and hybrid modes, in en and es", async () => {
  const packs = path.resolve(import.meta.dirname, "../../../packs");
  const embedder: Embedder = {
    model: "mixed-language-test",
    dim: 2,
    async embed(texts) {
      return texts.map(() => Float32Array.from([1, 0]));
    },
  };
  for (const lang of ["en", "es"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-mixed-language-"));
    try {
      const vault = Vault.load(root);
      installPack(vault, packs, "rust-api", { lang });
      installPack(vault, packs, "profiles", { lang });
      await syncIndex(vault, embedder);
      const index = loadIndex(vault);
      const queries =
        lang === "en"
          ? [
              "Rust API with a web frontend and a dashboard",
              "Rust API with a React frontend",
              "FastAPI API with a React frontend",
              "Python FastAPI API with a TypeScript React frontend",
            ]
          : [
              "API Rust con un frontend web y un dashboard",
              "API Rust con un frontend React",
              "API FastAPI con un frontend React",
              "API Python FastAPI con un frontend TypeScript React",
            ];
      for (const query of queries) {
        for (const result of [
          recommend(vault, query, { perLayer: 100 }),
          await recommendHybrid(vault, query, index, embedder, { weight: 0, perLayer: 100 }),
        ]) {
          assert.ok(result.layers.frontend.some((candidate) => candidate.id === "react"));
          assert.ok(result.layers.frontend.some((candidate) => candidate.id === "typescript"));
          assert.ok(result.layers.frontend.every((candidate) => candidate.score_breakdown.language >= 0));
          if (query.includes("Rust")) {
            assert.equal(
              result.layers.backend.some((candidate) => candidate.id === "fastapi"),
              false,
            );
          }
        }
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("coverage is evaluated per layer for a technology spanning several layers", () => {
  const { vault, cleanup } = fixture();
  try {
    vault.writeNote("frontend", { type: "layer", tags: [], source: "manual" }, "");
    vault.writeNote(
      "cross-layer",
      {
        type: "tech",
        kind: "library",
        language: "python",
        layer: ["backend", "frontend"],
        use_when: ["HTTP API"],
        tags: [],
        source: "manual",
      },
      "",
    );
    const result = recommend(vault, "Rust HTTP API", { perLayer: 100 });
    assert.equal(
      result.layers.backend.some((candidate) => candidate.id === "cross-layer"),
      false,
    );
    assert.equal(result.layers.frontend[0]?.id, "cross-layer");
    assert.equal(result.layers.frontend[0]?.language_boost, 0);
    vault.writeNote(
      "native-view",
      {
        type: "tech",
        kind: "library",
        language: "rust",
        layer: "frontend",
        use_when: ["HTTP API"],
        tags: [],
        source: "manual",
      },
      "",
    );
    const covered = recommend(vault, "Rust HTTP API", { perLayer: 100 });
    assert.equal(covered.layers.frontend[0]?.id, "native-view");
    assert.equal(
      covered.layers.frontend.some((candidate) => candidate.id === "cross-layer"),
      false,
    );
  } finally {
    cleanup();
  }
});

test("language coverage cannot empty a layer when native candidates have no usable match", async () => {
  const { vault, cleanup } = fixture();
  const embedder: Embedder = {
    model: "language-fallback-test",
    dim: 2,
    async embed(texts) {
      return texts.map((text) => Float32Array.from(text.includes("cold") ? [0, 1] : [1, 0]));
    },
  };
  try {
    vault.writeNote("infra", { type: "layer", tags: [], source: "manual" }, "");
    vault.writeNote(
      "native-impl",
      {
        type: "tech",
        kind: "library",
        language: "rust",
        layer: "infra",
        use_when: ["kernel"],
        tags: ["cold"],
        source: "manual",
      },
      "cold",
    );
    vault.writeNote(
      "foreign-impl",
      {
        type: "tech",
        kind: "library",
        language: "python",
        layer: "infra",
        use_when: ["telemetry HTTP"],
        tags: [],
        source: "manual",
      },
      "",
    );
    const keyword = recommend(vault, "Rust telemetry");
    assert.equal(keyword.layers.infra[0]?.id, "foreign-impl");
    assert.equal(keyword.layers.infra[0]?.language_boost, 0);
    const native = vault.get("native-impl");
    assert.ok(native?.data.type === "tech");
    vault.writeNote(native.id, { ...native.data, use_when: ["HTTP"] }, native.body);
    await syncIndex(vault, embedder);
    const hybrid = await recommendHybrid(vault, "Rust HTTP", loadIndex(vault), embedder, { weight: 0 });
    assert.equal(hybrid.layers.infra[0]?.id, "foreign-impl");
    assert.equal(hybrid.layers.infra[0]?.language_boost, 0);
  } finally {
    cleanup();
  }
});
