import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { type Embedder, installPack, listPacks, loadIndex, recommend, recommendHybrid, syncIndex, Vault } from "../src/index.js";
import { techNameContext } from "../src/tech-names.js";

const PACKS = path.resolve(import.meta.dirname, "../../../packs");
const embedding: Embedder = {
  model: "ambiguous-name-test",
  dim: 2,
  async embed(texts) {
    return texts.map(() => Float32Array.from([1, 0]));
  },
};

test.each(["en", "es"])("Swift language phrases and vault-derived Apple platform anchors keep SwiftUI first (%s)", async (lang) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-swift-context-"));
  try {
    const vault = Vault.load(root);
    for (const pack of listPacks(PACKS)) installPack(vault, PACKS, pack.name, { lang });
    await syncIndex(vault, embedding);
    const index = loadIndex(vault);
    const queries =
      lang === "en"
        ? [
            "native iOS app in Swift",
            "Swift iOS app with offline storage",
            "SwiftUI app",
            "Swift app with macOS tooling",
            "Swift app with Xcode tooling",
            "build an app using Swift",
            "an app written in Swift",
          ]
        : [
            "una app iOS nativa en Swift",
            "app Swift iOS con almacenamiento offline",
            "app SwiftUI",
            "app Swift con herramientas macOS",
            "app Swift con herramientas Xcode",
            "crear una app con Swift",
          ];
    for (const query of queries) {
      const context = techNameContext(vault.byType("tech"), query);
      assert.ok(context.mentioned.has("swift"), query);
      for (const result of [recommend(vault, query), await recommendHybrid(vault, query, index, embedding, { weight: 0 })]) {
        assert.equal(result.layers.mobile[0]?.id, "swiftui", query);
        assert.equal(result.layers.mobile[0]?.language_boost, 3, query);
        assert.equal(
          result.layers.mobile.some((candidate) => candidate.id === "react-native"),
          false,
          query,
        );
      }
    }
    // The platform association comes from vault data; a platform word alone
    // cannot qualify an arbitrary ambiguous language note with no such metadata.
    const swift = vault.get("swift");
    assert.ok(swift?.data.type === "tech");
    const isolated = [{ ...swift, data: { ...swift.data, use_when: [], tags: [] } }];
    assert.equal(techNameContext(isolated, "Swift iOS app").mentioned.has("swift"), false);
    assert.equal(
      techNameContext([{ ...swift, data: { ...swift.data, use_when: [], tags: ["ios"] } }], "Swift iOS app").mentioned.has("swift"),
      true,
    );
    assert.equal(techNameContext(isolated, "an app using Swift").mentioned.has("swift"), true);
    assert.equal(techNameContext(isolated, "una app en Swift").mentioned.has("swift"), true);
    const collision = "swift checkout flow for an online store with Next.js";
    assert.equal(techNameContext(vault.byType("tech"), collision).mentioned.has("swift"), false);
    assert.equal(recommend(vault, collision).layers.frontend[0]?.id, "nextjs");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test.each(["en", "es"])("ordinary words neither infer languages nor exempt named tools (%s)", async (lang) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-ordinary-name-"));
  try {
    const vault = Vault.load(root);
    for (const pack of listPacks(PACKS)) installPack(vault, PACKS, pack.name, { lang });
    const cases =
      lang === "en"
        ? [
            ["a mobile app to share a poem with friends", "rust"],
            ["an echo chamber analytics dashboard in Python", "go"],
            ["rocket launch tracker web app with React", "rust"],
            ["fiber network inventory API in Python", "go"],
            ["swift checkout flow for an online store with Next.js", "swift"],
            ["plan the next quarter roadmap for the team", "typescript"],
          ]
        : [
            ["una app móvil para compartir un poema con amigos", "rust"],
            ["un panel de analítica de cámara de eco en Python", "go"],
            ["app web para seguir lanzamientos de cohetes con React", "rust"],
            ["API de inventario de red de fibra en Python", "go"],
            ["un flujo de pago rápido para una tienda online con Next.js", "swift"],
            ["planificar el próximo trimestre del equipo", "typescript"],
          ];
    await syncIndex(vault, embedding);
    const index = loadIndex(vault);
    for (const [query, unrelated] of cases) {
      const context = techNameContext(vault.byType("tech"), query);
      assert.equal(context.mentioned.has(unrelated), false, query);
      for (const result of [recommend(vault, query), await recommendHybrid(vault, query, index, embedding, { weight: 0 })]) {
        for (const candidates of Object.values(result.layers))
          for (const candidate of candidates) {
            const note = vault.get(candidate.id);
            if (note?.data.type === "tech" && note.data.language === unrelated) assert.ok(candidate.language_boost <= 0, query);
          }
        if (query.includes("inventory") || query.includes("inventario")) assert.equal(result.layers.backend[0]?.id, "fastapi");
        if (query.includes("React")) assert.ok(result.layers.frontend.some((candidate) => candidate.id === "react"));
        if (query.includes("Next.js")) assert.equal(result.layers.frontend[0]?.id, "nextjs");
      }
    }
    for (const word of ["poem", "rocket", "echo", "fiber", "swift", "next"]) {
      const query = `Python API for a dataset containing the word ${word}`;
      const context = techNameContext(vault.byType("tech"), query);
      assert.equal(context.named.has(word === "next" ? "nextjs" : word), false, query);
      assert.ok(context.blocked.has(word), query);
    }
    assert.equal(techNameContext(vault.byType("tech"), "Poem and Rocket").mentioned.has("rust"), false);
    assert.deepEqual(recommend(vault, "plan the next quarter roadmap for the team").layers.frontend, []);
    assert.deepEqual(recommend(vault, "plan the next quarter roadmap for the team").layers.backend, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test.each(["en", "es"])("nearby stack cues and independent ecosystem anchors qualify ambiguous names (%s)", (lang) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-name-cue-"));
  try {
    const vault = Vault.load(root);
    for (const pack of listPacks(PACKS)) installPack(vault, PACKS, pack.name, { lang });
    const cases =
      lang === "en"
        ? [
            ["Rocket API in Rust", "rocket", "rust"],
            ["Echo REST API in Go", "echo", "go"],
            ["Poem API", "poem", "rust"],
            ["Fiber API", "fiber", "go"],
            ["Swift language for iOS", "swift", "swift"],
            ["package next", "nextjs", "typescript"],
            ["Rust with Poem", "poem", "rust"],
            ["Go with Echo", "echo", "go"],
            ["Axum with Poem", "poem", "rust"],
            ["Gin with Echo", "echo", "go"],
            ["Next.js SaaS with Postgres", "nextjs", "typescript"],
          ]
        : [
            ["API Rocket en Rust", "rocket", "rust"],
            ["API REST Echo en Go", "echo", "go"],
            ["framework Poem para API", "poem", "rust"],
            ["API Fiber", "fiber", "go"],
            ["lenguaje Swift para iOS", "swift", "swift"],
            ["paquete next", "nextjs", "typescript"],
            ["Rust con Poem", "poem", "rust"],
            ["Go con Echo", "echo", "go"],
            ["Axum con Poem", "poem", "rust"],
            ["Gin con Echo", "echo", "go"],
            ["SaaS Next.js con Postgres", "nextjs", "typescript"],
          ];
    for (const [query, id, language] of cases) {
      const context = techNameContext(vault.byType("tech"), query);
      assert.ok(context.named.has(id), query);
      assert.ok(context.mentioned.has(language), query);
      const result = recommend(vault, query, { perLayer: 100 });
      if (id === "swift") {
        assert.equal(result.layers.mobile[0]?.id, "swiftui", query);
        assert.equal(result.layers.mobile[0]?.language_boost, 3, query);
      } else
        assert.ok(
          Object.values(result.layers)
            .flat()
            .some((candidate) => candidate.id === id && candidate.language_boost === 3),
          query,
        );
    }
    const without = techNameContext(vault.byType("tech"), "an echo chamber for Python");
    assert.equal(without.named.has("echo"), false);
    assert.equal(without.mentioned.has("go"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
