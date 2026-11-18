import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { installedPacks, installPack, listPacks, packNotes, readPackTasks, recommend, updatePack, Vault } from "../src/index.js";

const PACKS = path.resolve(import.meta.dirname, "../../../packs");
const SHARED = ["python", "pytest", "python-typing", "python-lint-types"];
const content = (note: { data: Record<string, unknown>; body: string }) => {
  const data = { ...note.data };
  delete data.source;
  delete data.updated;
  return { data, body: note.body };
};

test.each(["en", "es"])("data-ml installs an isolated, closed Python graph with competition (%s)", (lang) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-data-ml-"));
  try {
    const vault = Vault.load(root);
    const installed = installPack(vault, PACKS, "data-ml", { lang });
    assert.deepEqual(Object.keys(installed.byPack).sort(), ["core-layers", "data-ml", "databases", "python"]);
    assert.equal(vault.notes.size, 41);
    assert.deepEqual(vault.issues, []);
    for (const id of ["fastapi", "react", "flutter", "go", "rust", "ml-api"]) assert.equal(vault.get(id), undefined);
    const notes = packNotes(PACKS, "data-ml", lang);
    assert.equal(notes.length, 26);
    assert.deepEqual(
      notes.map((note) => note.id).sort(),
      packNotes(PACKS, "data-ml", lang === "en" ? "es" : "en")
        .map((note) => note.id)
        .sort(),
    );
    for (const layer of ["data", "ml", "testing"]) {
      assert.ok(vault.techInLayer(layer).length >= 5);
    }
    for (const note of notes) {
      if (note.data.type !== "tech") continue;
      assert.equal(note.data.language, "python");
      assert.ok(note.data.use_when.length && note.data.avoid_when.length && note.data.performs_best.length);
      assert.ok(note.data.related.length && note.data.practices.length && note.data.checks.length);
    }
    for (const note of vault.notes.values()) {
      for (const match of note.body.matchAll(/\[\[([^\]|#]+)(?:[^\]]*)\]\]/g)) assert.ok(vault.get(match[1]), `${note.id}: ${match[1]}`);
    }
    for (const id of SHARED) assert.equal(vault.get(id)?.data.source, "pack:python@1.0.0");
    assert.deepEqual(installPack(vault, PACKS, "data-ml", { lang }).installed, []);
    const tasks = readPackTasks(PACKS, "data-ml");
    assert.equal(tasks.length, 4);
    for (const task of tasks) {
      assert.deepEqual(Object.keys(task.prompt).sort(), ["en", "es"]);
      assert.deepEqual(Object.keys(task.title).sort(), ["en", "es"]);
      assert.deepEqual(task.expected_layers, ["data", "ml", "testing"]);
      assert.equal(vault.get(task.id), undefined);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test.each(["en", "es"])("1.8.12 Python layout migrates through review without losing pre-update edits (%s)", (lang) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-python-move-"));
  try {
    const vault = Vault.load(root);
    for (const [pack, version] of [
      ["core-layers", "1.1.0"],
      ["databases", "1.0.0"],
      ["python-api", "1.2.0"],
      ["python", "1.2.0"],
    ]) {
      for (const note of packNotes(PACKS, pack, lang)) {
        if (["ml", "duckdb"].includes(note.id)) continue;
        const owner = pack === "python" ? "python-api" : pack;
        const body = note.id === "python" ? note.body.replace(/\bfastapi\b/, "[[fastapi]]") : note.body;
        vault.writeNote(
          note.id,
          { ...note.data, source: `pack:${owner}@${version}`, pack_lang: lang, tags: [...note.data.tags, `local-${lang}`] },
          `${body}\nUser edit before update: ${note.id} ${lang}.`,
          { reload: false },
        );
      }
    }
    vault.reload();
    assert.equal(vault.notes.size, 16);
    const before = new Map([...vault.notes.values()].map((note) => [note.id, content(note)]));
    const hashes = [...vault.notes.values()].map((note) => [note.id, note.hash]);
    updatePack(vault, PACKS, "python-api");
    assert.deepEqual(
      [...vault.notes.values()].map((note) => [note.id, note.hash]),
      hashes,
    );
    assert.equal(vault.listProposals().length, 18);
    for (const proposal of vault.listProposals()) {
      if (["ml", "duckdb"].includes(proposal.id)) continue;
      assert.deepEqual(content(proposal), before.get(proposal.id));
      assert.equal(proposal.meta.base_hash, vault.get(proposal.id)?.hash);
    }
    const pending = vault.listProposals().map((proposal) => fs.readFileSync(proposal.path, "utf8"));
    updatePack(vault, PACKS, "python-api");
    assert.deepEqual(
      vault.listProposals().map((proposal) => fs.readFileSync(proposal.path, "utf8")),
      pending,
    );
    vault.approve("python");
    updatePack(vault, PACKS, "python-api");
    assert.equal(vault.getProposal("python"), undefined);
    assert.deepEqual(vault.approveMany().failed, []);
    const fresh = Vault.load(root);
    assert.equal(fresh.notes.size, 18);
    for (const [id, expected] of before) assert.deepEqual(content(fresh.get(id)!), expected);
    for (const id of SHARED) assert.equal(fresh.get(id)?.data.source, "pack:python@1.0.0");
    assert.equal(fresh.get("fastapi")?.data.source, "pack:python-api@1.3.0");
    assert.equal(fresh.get("postgresql")?.data.source, "pack:databases@1.1.0");
    assert.equal(installedPacks(fresh)["core-layers"], "1.2.0");
    assert.deepEqual(fresh.issues, []);
    assert.equal(updatePack(fresh, PACKS, "python-api").upToDate, true);
    installPack(fresh, PACKS, "data-ml", { lang });
    assert.equal(fresh.notes.size, 44);
    for (const [id, expected] of before) assert.deepEqual(content(fresh.get(id)!), expected);
    assert.deepEqual(fresh.issues, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test.each(["en", "es"])("data/ML profiles rank first and serving, web, mobile and API controls retain their stacks (%s)", (lang) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-ml-ranking-"));
  try {
    const vault = Vault.load(root);
    for (const pack of listPacks(PACKS)) installPack(vault, PACKS, pack.name, { lang });
    const cases =
      lang === "en"
        ? ([
            ["Python data analysis cleaning a CSV and producing a report", "data-analysis", "data", ["pandas", "polars", "duckdb"]],
            ["Python machine learning classifier training with a held-out split", "ml-training", "ml", ["scikit-learn"]],
            ["Python scheduled batch data pipeline reading Parquet files", "batch-data", "ml", ["prefect", "dagster", "dvc"]],
          ] as const)
        : ([
            ["Análisis de datos Python para limpiar CSV y producir un informe", "data-analysis", "data", ["pandas", "polars", "duckdb"]],
            ["Entrenamiento Python de clasificador con partición reservada", "ml-training", "ml", ["scikit-learn"]],
            ["Pipeline batch Python procesando archivos Parquet", "batch-data", "ml", ["prefect", "dagster", "dvc"]],
          ] as const);
    for (const [query, profile, layer, expected] of cases) {
      const result = recommend(vault, query);
      assert.equal(result.profiles[0]?.id, profile, query);
      assert.ok((expected as readonly string[]).includes(result.layers[layer][0]?.id), query);
    }
    const serving = recommend(vault, lang === "en" ? "FastAPI model-serving API" : "API FastAPI para servir modelos ML");
    assert.equal(serving.profiles[0]?.id, "ml-api");
    assert.equal(serving.layers.backend[0]?.id, "fastapi");
    const web = recommend(
      vault,
      lang === "en" ? "TypeScript React web dashboard with Vitest tests" : "Dashboard web React TypeScript con pruebas Vitest",
    );
    assert.equal(web.profiles[0]?.id, "saas-web");
    assert.equal(web.layers.frontend[0]?.id, "react");
    assert.equal(web.layers.testing[0]?.id, "vitest");
    const mobile = recommend(
      vault,
      lang === "en" ? "Flutter Dart mobile app with offline records" : "App móvil Flutter Dart con registros offline",
    );
    assert.equal(mobile.layers.mobile[0]?.id, "flutter");
    assert.equal(mobile.profiles[0]?.id, "mobile-flutter");
    for (const language of ["Go", "Rust"]) {
      const result = recommend(vault, `${language} HTTP API JSON PostgreSQL`);
      const first = vault.get(result.layers.backend[0]?.id);
      assert.ok(first?.data.type === "tech" && first.data.language === language.toLowerCase());
      assert.equal(result.profiles[0]?.id, `${language.toLowerCase()}-api`);
    }
    const profile = vault.get("ml-api");
    assert.ok(profile?.data.type === "profile");
    for (const ids of Object.values(profile.data.stack)) for (const id of ids) assert.equal(vault.get(id)?.data.type, "tech");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
