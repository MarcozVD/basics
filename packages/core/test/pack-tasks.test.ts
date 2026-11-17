import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { installPack, packNotes, readPackTasks, recommend, Vault } from "../src/index.js";

const PACKS = path.resolve(import.meta.dirname, "../../../packs");

test("optional tasks preserve legacy packs and expose four bilingual Rust comparisons", () => {
  assert.deepEqual(readPackTasks(PACKS, "python-api"), []);
  const tasks = readPackTasks(PACKS, "rust-api");
  assert.equal(tasks.length, 4);
  for (const task of tasks) {
    assert.deepEqual(Object.keys(task.title).sort(), ["en", "es"]);
    assert.deepEqual(Object.keys(task.prompt).sort(), ["en", "es"]);
    assert.deepEqual(task.expected_layers, ["backend", "data", "testing"]);
  }
  assert.throws(() => readPackTasks(PACKS, "../rust-api"));
});

test("task reader rejects malformed metadata while note installation safely ignores it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-task-format-"));
  try {
    fs.cpSync(PACKS, dir, { recursive: true });
    const file = path.join(dir, "rust-api/tasks.json");
    const original = JSON.parse(fs.readFileSync(file, "utf8"));
    const invalid = [
      { ...original, schema_version: 2 },
      { ...original, tasks: [] },
      { ...original, tasks: [original.tasks[0], original.tasks[0]] },
      ...[
        { id: "../escape" },
        { title: { en: "Title" } },
        { prompt: { en: " ", es: "Texto" } },
        { prompt: { ...original.tasks[0].prompt, fr: "Texte" } },
        { expected_layers: [] },
        { expected_layers: ["backend", "backend"] },
        { command: "never execute metadata" },
      ].map((patch) => ({ ...original, tasks: [{ ...original.tasks[0], ...patch }] })),
    ];
    for (const data of invalid) {
      fs.writeFileSync(file, JSON.stringify(data));
      assert.throws(() => readPackTasks(dir, "rust-api"));
    }
    fs.writeFileSync(file, "invalid JSON");
    assert.throws(() => readPackTasks(dir, "rust-api"));
    fs.mkdirSync(path.join(dir, "vault"));
    const vault = Vault.load(path.join(dir, "vault"));
    installPack(vault, dir, "rust-api");
    assert.deepEqual(vault.issues, []);
    for (const task of original.tasks) assert.equal(vault.get(task.id), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Rust profile installs a closed bilingual graph with real competition in each layer", () => {
  for (const lang of ["en", "es"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-rust-pack-"));
    try {
      const vault = Vault.load(root);
      installPack(vault, PACKS, "rust-api", { lang });
      assert.deepEqual(vault.issues, []);
      assert.equal(vault.get("rust-api")?.data.type, "profile");
      assert.equal(vault.get("rust-api")?.data.source, "pack:rust-api@1.0.0");
      assert.equal(vault.get("postgresql")?.data.source, "pack:python-api@1.1.0");
      const notes = packNotes(PACKS, "rust-api", lang);
      assert.equal(notes.length, 27);
      assert.equal(
        notes.some((note) => note.id === "postgresql"),
        false,
      );
      for (const layer of ["backend", "data", "testing"]) {
        assert.ok(notes.filter((note) => note.data.type === "tech" && note.data.layer === layer).length >= 5);
      }
      for (const note of notes) {
        if (note.data.type !== "tech") continue;
        assert.ok(note.data.use_when.length && note.data.avoid_when.length && note.data.performs_best.length);
        assert.ok(note.data.related.length && note.data.practices.length);
        if (note.id !== "rust" && note.id !== "sqlite") assert.equal(note.data.language, "rust");
      }
      for (const task of readPackTasks(PACKS, "rust-api")) {
        for (const layer of task.expected_layers) assert.equal(vault.get(layer)?.data.type, "layer");
      }
      installPack(vault, PACKS, "profiles", { lang });
      const description = lang === "en" ? "Rust HTTP API with JSON endpoints and PostgreSQL" : "API HTTP Rust con JSON y PostgreSQL";
      assert.equal(recommend(vault, description).profiles[0]?.id, "rust-api");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("installed Rust APIs rank native tools while Python and TypeScript requests retain their tools", () => {
  for (const lang of ["en", "es"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-rust-ranking-"));
    try {
      const vault = Vault.load(root);
      installPack(vault, PACKS, "rust-api", { lang });
      installPack(vault, PACKS, "profiles", { lang });
      const descriptions =
        lang === "en"
          ? [
              "Rust HTTP API with JSON endpoints and PostgreSQL",
              "High-throughput Rust microservice using Axum and Tokio with sqlx",
              "Rust REST inventory service with JSON validation and cargo tests",
            ]
          : [
              "API HTTP Rust con JSON y PostgreSQL",
              "Microservicio Rust de alto rendimiento con Axum y Tokio y sqlx",
              "Servicio REST en Rust para inventario con validacion JSON y pruebas cargo",
            ];
      for (const description of descriptions) {
        const result = recommend(vault, description);
        assert.equal(result.profiles[0]?.id, "rust-api");
        for (const layer of ["backend", "testing"]) {
          const first = vault.get(result.layers[layer][0]?.id);
          assert.ok(first?.data.type === "tech" && (first.id === "rust" || first.data.language === "rust"));
        }
      }
      const python = recommend(
        vault,
        lang === "en"
          ? "FastAPI service in Python for loan scoring with pytest"
          : "Servicio FastAPI en Python para puntuar prestamos con pytest",
      );
      assert.equal(python.layers.backend[0]?.id, "fastapi");
      assert.equal(python.layers.testing[0]?.id, "pytest");
      const typescript = recommend(
        vault,
        lang === "en" ? "TypeScript CLI and React dashboard with Vitest tests" : "CLI TypeScript y panel React con pruebas Vitest",
      );
      assert.equal(typescript.layers.backend[0]?.id, "typescript");
      assert.equal(typescript.layers.frontend[0]?.id, "react");
      assert.equal(typescript.layers.testing[0]?.id, "vitest");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("installing general profiles does not install the Rust stack", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-profiles-scope-"));
  try {
    const vault = Vault.load(root);
    installPack(vault, PACKS, "profiles");
    assert.equal(vault.get("rust"), undefined);
    assert.equal(vault.get("rust-api"), undefined);
    assert.deepEqual(vault.issues, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
