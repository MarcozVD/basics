import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { installPack, listPacks, packNotes, readPackTasks, recommend, updatePack, Vault } from "../src/index.js";

const PACKS = path.resolve(import.meta.dirname, "../../../packs");

test("mobile is bilingual, closed and independent of other stack packs", () => {
  const ids: string[][] = [];
  for (const lang of ["en", "es"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-mobile-"));
    try {
      const vault = Vault.load(root);
      const result = installPack(vault, PACKS, "mobile", { lang });
      assert.deepEqual(Object.keys(result.byPack).sort(), ["core-layers", "databases", "mobile", "typescript"]);
      assert.deepEqual(vault.issues, []);
      assert.equal(vault.notes.size, 46);
      for (const id of ["react", "nextjs", "vitest", "python", "rust", "go"]) assert.equal(vault.get(id), undefined);
      assert.equal(vault.get("typescript")?.data.source, "pack:typescript@1.0.0");
      assert.equal(vault.get("mobile")?.data.type, "layer");
      assert.equal(vault.get("mobile")?.data.source, "pack:core-layers@1.2.0");
      const notes = packNotes(PACKS, "mobile", lang);
      assert.equal(notes.length, 32);
      ids.push(notes.map((note) => note.id).sort());
      for (const layer of ["mobile", "data", "testing"]) {
        assert.ok(notes.filter((note) => note.data.type === "tech" && note.data.layer === layer).length >= 5);
      }
      for (const note of notes) {
        if (note.data.type !== "tech") continue;
        assert.ok(note.data.use_when.length && note.data.avoid_when.length && note.data.performs_best.length);
        assert.ok(note.data.related.length && note.data.practices.length);
        if (note.id === "maestro") assert.equal(note.data.language, undefined);
        else assert.ok(["typescript", "dart", "kotlin", "swift"].includes(note.data.language ?? ""));
      }
      assert.deepEqual(installPack(vault, PACKS, "mobile", { lang }).installed, []);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
  assert.deepEqual(ids[0], ids[1]);
});

test("mobile comparison tasks use the shared bilingual format and mobile layer", () => {
  const tasks = readPackTasks(PACKS, "mobile");
  assert.equal(tasks.length, 4);
  for (const task of tasks) {
    assert.deepEqual(Object.keys(task.title).sort(), ["en", "es"]);
    assert.deepEqual(Object.keys(task.prompt).sort(), ["en", "es"]);
    assert.deepEqual(task.expected_layers, ["mobile", "data", "testing"]);
  }
});

test.each(["en", "es"])("old web/core update preserves local edits while sharing TypeScript and adding mobile (%s)", (lang) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-mobile-move-"));
  const content = (note: { data: Record<string, unknown>; body: string }) => {
    const data = { ...note.data };
    delete data.source;
    delete data.updated;
    return { data, body: note.body };
  };
  try {
    const vault = Vault.load(root);
    for (const note of packNotes(PACKS, "core-layers", lang).filter((note) => !["mobile", "ml"].includes(note.id))) {
      vault.writeNote(note.id, { ...note.data, source: "pack:core-layers@1.0.0", pack_lang: lang }, note.body, { reload: false });
    }
    for (const pack of ["web-typescript", "typescript"])
      for (const note of packNotes(PACKS, pack, lang)) {
        let body = note.body;
        if (note.id === "typescript") body = body.replace(/\b(react|nextjs|vitest)\b/g, "[[$1]]");
        vault.writeNote(
          note.id,
          {
            ...note.data,
            source: "pack:web-typescript@1.1.0",
            pack_lang: lang,
            tags: [...note.data.tags, `local-${lang}`],
          },
          `${body}\nLocal edit: ${note.id} ${lang}.`,
          { reload: false },
        );
      }
    vault.reload();
    assert.deepEqual(vault.issues, []);
    assert.equal(vault.notes.size, 14);
    const before = new Map([...vault.notes.values()].map((note) => [note.id, content(note)]));
    updatePack(vault, PACKS, "web-typescript");
    assert.equal(vault.listProposals().length, 16);
    assert.equal(vault.get("mobile"), undefined);
    assert.equal(vault.getProposal("mobile")?.meta.proposed_by, "pack:core-layers@1.2.0");
    for (const proposal of vault.listProposals().filter((proposal) => !["mobile", "ml"].includes(proposal.id))) {
      assert.deepEqual(content(proposal), before.get(proposal.id));
    }
    const pending = vault.listProposals().map((proposal) => fs.readFileSync(proposal.path, "utf8"));
    updatePack(vault, PACKS, "web-typescript");
    assert.deepEqual(
      vault.listProposals().map((proposal) => fs.readFileSync(proposal.path, "utf8")),
      pending,
    );
    assert.deepEqual(vault.approveMany().failed, []);
    const fresh = Vault.load(root);
    assert.equal(fresh.notes.size, 16);
    for (const [id, expected] of before) assert.deepEqual(content(fresh.get(id) as NonNullable<ReturnType<Vault["get"]>>), expected);
    for (const id of ["typescript", "typescript-strict", "typescript-typecheck"])
      assert.equal(fresh.get(id)?.data.source, "pack:typescript@1.0.0");
    assert.equal(fresh.get("react")?.data.source, "pack:web-typescript@1.2.0");
    assert.equal(fresh.get("mobile")?.data.source, "pack:core-layers@1.2.0");
    assert.deepEqual(fresh.issues, []);
    assert.equal(updatePack(fresh, PACKS, "web-typescript").upToDate, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test.each(["en", "es"])("frameworks and mixed backends rank without mobile taking over web or APIs (%s)", (lang) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-mobile-ranking-"));
  try {
    const vault = Vault.load(root);
    for (const pack of listPacks(PACKS)) installPack(vault, PACKS, pack.name, { lang });
    const cases =
      lang === "en"
        ? [
            ["Flutter mobile app with offline records", "flutter"],
            ["Dart mobile UI with offline SQLite notes", "flutter"],
            ["React Native mobile app for Android and iOS", "rn"],
            ["Expo mobile app with TypeScript and native screens", "rn"],
          ]
        : [
            ["App móvil Flutter con registros offline", "flutter"],
            ["UI móvil Dart con notas offline SQLite", "flutter"],
            ["App móvil React Native para Android e iOS", "rn"],
            ["App móvil Expo con TypeScript y pantallas nativas", "rn"],
          ];
    for (const [query, expected] of cases) {
      const result = recommend(vault, query);
      assert.ok(
        expected === "flutter" ? result.layers.mobile[0]?.id === "flutter" : ["react-native", "expo"].includes(result.layers.mobile[0]?.id),
        query,
      );
      assert.equal(result.profiles[0]?.id, expected === "flutter" ? "mobile-flutter" : "mobile-react-native", query);
    }
    for (const query of lang === "en"
      ? ["Flutter Dart mobile app with a Go HTTP API backend", "TypeScript React Native mobile app with a Rust HTTP API backend"]
      : ["App móvil Flutter Dart con backend API HTTP Go", "App móvil TypeScript React Native con backend API HTTP Rust"]) {
      const result = recommend(vault, query);
      assert.ok(
        query.includes("Flutter")
          ? result.layers.mobile[0]?.id === "flutter"
          : ["react-native", "expo"].includes(result.layers.mobile[0]?.id),
      );
      const note = vault.get(result.layers.backend[0]?.id);
      assert.ok(
        note?.data.type === "tech" &&
          (query.includes("Go") ? note.data.language === "go" : note.id === "rust" || note.data.language === "rust"),
      );
    }
    const web = recommend(
      vault,
      lang === "en" ? "TypeScript React web dashboard with Vitest tests" : "Dashboard web React TypeScript con pruebas Vitest",
    );
    assert.equal(web.layers.frontend[0]?.id, "react");
    assert.equal(web.layers.testing[0]?.id, "vitest");
    assert.equal(web.profiles[0]?.id, "saas-web");
    assert.deepEqual(web.layers.mobile, []);
    const api = recommend(vault, lang === "en" ? "Go HTTP API with JSON endpoints and PostgreSQL" : "API HTTP Go con JSON y PostgreSQL");
    assert.equal(api.profiles[0]?.id, "go-api");
    const backend = vault.get(api.layers.backend[0]?.id);
    assert.ok(backend?.data.type === "tech" && backend.data.language === "go");
    assert.equal(
      api.layers.mobile.some((candidate) => ["react-native", "expo", "flutter", "jetpack-compose", "swiftui"].includes(candidate.id)),
      false,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
