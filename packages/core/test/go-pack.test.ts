import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { installPack, listPacks, packNotes, readPackTasks, recommend, Vault } from "../src/index.js";

const PACKS = path.resolve(import.meta.dirname, "../../../packs");

test("Go pack installs a closed bilingual graph with distinct alternatives and shared database notes", () => {
  const ids: string[][] = [];
  for (const lang of ["en", "es"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-go-content-"));
    try {
      const vault = Vault.load(root);
      installPack(vault, PACKS, "go-api", { lang });
      assert.deepEqual(vault.issues, []);
      assert.equal(vault.get("go-api")?.data.source, "pack:go-api@1.1.0");
      assert.equal(vault.get("postgresql")?.data.source, "pack:databases@1.0.0");
      assert.equal(vault.get("sqlite")?.data.source, "pack:databases@1.0.0");
      const notes = packNotes(PACKS, "go-api", lang);
      assert.equal(notes.length, 27);
      ids.push(notes.map((note) => note.id).sort());
      assert.equal(
        notes.some((note) => ["postgresql", "sqlite"].includes(note.id)),
        false,
      );
      for (const layer of ["backend", "data", "testing"]) {
        assert.ok(notes.filter((note) => note.data.type === "tech" && note.data.layer === layer).length >= 5);
      }
      for (const note of notes) {
        if (note.data.type !== "tech") continue;
        assert.equal(note.data.language, "go");
        assert.ok(note.data.use_when.length && note.data.avoid_when.length && note.data.performs_best.length);
        assert.ok(note.data.related.length && note.data.practices.length && note.data.checks.length);
        for (const id of [...note.data.related, ...note.data.practices, ...note.data.checks]) assert.ok(vault.get(id));
      }
      assert.deepEqual(installPack(vault, PACKS, "go-api", { lang }).installed, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  assert.deepEqual(ids[0], ids[1]);
});

test("Go comparison tasks reuse version 1 metadata without becoming notes", () => {
  const tasks = readPackTasks(PACKS, "go-api");
  assert.deepEqual(
    tasks.map((task) => task.id),
    ["login-api", "inventory-api", "webhook-inbox", "local-notes"],
  );
  for (const task of tasks) {
    assert.deepEqual(Object.keys(task.title).sort(), ["en", "es"]);
    assert.deepEqual(Object.keys(task.prompt).sort(), ["en", "es"]);
    assert.deepEqual(task.expected_layers, ["backend", "data", "testing"]);
    assert.ok(task.prompt.en.includes("Go") && task.prompt.es.includes("Go"));
  }
  assert.ok(tasks.every((task) => !packNotes(PACKS, "go-api", "en").some((note) => note.id === task.id)));
});

test("general profiles do not pull the Go stack", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-go-isolation-"));
  try {
    const vault = Vault.load(root);
    installPack(vault, PACKS, "profiles");
    assert.equal(vault.get("go"), undefined);
    assert.equal(vault.get("go-api"), undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Go tools lead Go APIs while mixed frontends and Python/Rust/TypeScript retain their choices", () => {
  for (const lang of ["en", "es"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-go-ranking-"));
    try {
      const vault = Vault.load(root);
      for (const pack of listPacks(PACKS)) installPack(vault, PACKS, pack.name, { lang });
      const native =
        lang === "en"
          ? [
              "Go HTTP API with JSON endpoints and PostgreSQL",
              "Golang service with Chi and pgx using context cancellation",
              "Go REST inventory service with JSON validation and go test",
              "Go login API with PostgreSQL and bounded concurrency",
              "Local Go notes API with SQLite and validation",
            ]
          : [
              "API HTTP Go con JSON y PostgreSQL",
              "Servicio Golang con Chi y pgx y cancelación por contexto",
              "Servicio REST Go de inventario con validación JSON y go test",
              "API de inicio de sesión Go con PostgreSQL y concurrencia acotada",
              "API local Go de notas con SQLite y validación",
            ];
      for (const query of native) {
        const result = recommend(vault, query);
        assert.equal(result.profiles[0]?.id, "go-api", query);
        for (const layer of ["backend", "testing"]) {
          const note = vault.get(result.layers[layer][0]?.id);
          assert.ok(note?.data.type === "tech" && note.data.language === "go", `${query}: ${layer}`);
        }
        const data = vault.get(result.layers.data[0]?.id);
        assert.ok(data?.data.type === "tech" && (data.data.language === "go" || data.data.kind === "database"));
      }
      const mixed =
        lang === "en"
          ? ["Go API with a web frontend and a dashboard", "Go API with a React frontend"]
          : ["API Go con un frontend web y un dashboard", "API Go con un frontend React"];
      for (const query of mixed) {
        const result = recommend(vault, query, { perLayer: 10 });
        assert.ok(result.layers.frontend.some((candidate) => candidate.id === "react"));
        assert.ok(result.layers.frontend.some((candidate) => candidate.id === "typescript"));
        assert.equal(
          result.layers.backend.some((candidate) => candidate.id === "fastapi"),
          false,
        );
      }
      const python = recommend(
        vault,
        lang === "en"
          ? "FastAPI service in Python for loan scoring with pytest"
          : "Servicio FastAPI en Python para puntuar prestamos con pytest",
      );
      assert.equal(python.layers.backend[0]?.id, "fastapi");
      assert.equal(python.layers.testing[0]?.id, "pytest");
      assert.notEqual(python.profiles[0]?.id, "go-api");
      const rust = recommend(
        vault,
        lang === "en" ? "Rust HTTP API with JSON endpoints and PostgreSQL" : "API HTTP Rust con JSON y PostgreSQL",
      );
      assert.equal(rust.profiles[0]?.id, "rust-api");
      for (const layer of ["backend", "testing"]) {
        assert.ok(rust.layers[layer].every((candidate) => vault.get(candidate.id)?.data.source === "pack:rust-api@1.1.0"));
      }
      const ts = recommend(
        vault,
        lang === "en" ? "TypeScript CLI and React dashboard with Vitest tests" : "CLI TypeScript y panel React con pruebas Vitest",
      );
      assert.equal(ts.layers.backend[0]?.id, "typescript");
      assert.equal(ts.layers.frontend[0]?.id, "react");
      assert.equal(ts.layers.testing[0]?.id, "vitest");
      assert.equal(ts.profiles[0]?.id, "saas-web");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
