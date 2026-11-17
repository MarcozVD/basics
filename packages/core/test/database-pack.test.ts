import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { installedPacks, installPack, packNotes, readPack, updatePack, Vault } from "../src/index.js";

const PACKS = path.resolve(import.meta.dirname, "../../../packs");
const SHARED = ["postgresql", "sql-migrations", "sqlite"];

function legacyPacks(root: string) {
  const packs = path.join(root, "legacy");
  fs.cpSync(PACKS, packs, { recursive: true });
  for (const [name, version, requires] of [
    ["python-api", "1.1.0", ["core-layers"]],
    ["rust-api", "1.0.0", ["python-api"]],
    ["go-api", "1.0.0", ["rust-api"]],
  ] as const) {
    const manifest = readPack(packs, name);
    fs.writeFileSync(path.join(packs, name, "pack.json"), JSON.stringify({ ...manifest, version, requires, note_moves: undefined }));
  }
  for (const lang of ["en", "es"]) {
    for (const [id, type, owner] of [
      ["postgresql", "tech", "python-api"],
      ["sql-migrations", "practices", "python-api"],
      ["sqlite", "tech", "rust-api"],
    ]) {
      const destination = path.join(packs, owner, "notes", lang, type, `${id}.md`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      let raw = fs.readFileSync(path.join(packs, "databases", "notes", lang, type, `${id}.md`), "utf8");
      if (id === "sqlite")
        raw = raw
          .replace('related: ["postgresql"]', 'related: ["postgresql","rusqlite","sqlx"]')
          .replace(/(Related notes|Notas relacionadas): \[\[postgresql\]\]\./, "$1: [[postgresql]], [[rusqlite]], [[sqlx]].");
      fs.writeFileSync(destination, raw);
    }
  }
  return packs;
}

function oldVault(root: string, lang: string) {
  const directory = path.join(root, "vault");
  fs.mkdirSync(directory);
  const vault = Vault.load(directory);
  installPack(vault, legacyPacks(root), "rust-api", { lang });
  assert.deepEqual(vault.issues, []);
  assert.equal(vault.notes.size, 41);
  return vault;
}

test("shared databases are closed and each API installs without other language stacks", () => {
  for (const lang of ["en", "es"])
    for (const pack of ["databases", "python-api", "rust-api", "go-api"]) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-db-install-"));
      try {
        const vault = Vault.load(root);
        const result = installPack(vault, PACKS, pack, { lang });
        assert.deepEqual(
          Object.keys(result.byPack),
          pack === "databases" ? ["core-layers", "databases"] : ["core-layers", "databases", pack],
        );
        assert.deepEqual(vault.issues, []);
        for (const id of SHARED) assert.equal(vault.get(id)?.data.source, "pack:databases@1.0.0");
        for (const [language, owner] of [
          ["python", "python-api"],
          ["rust", "rust-api"],
          ["go", "go-api"],
        ]) {
          assert.equal(Boolean(vault.get(language)), pack === owner);
        }
        assert.deepEqual(
          packNotes(PACKS, "databases", lang)
            .map((note) => note.id)
            .sort(),
          SHARED,
        );
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
});

test.each(
  ["en", "es"].flatMap((lang) => [
    { lang, order: ["python-api", "rust-api"] },
    { lang, order: ["rust-api", "python-api"] },
  ]),
)("legacy migration $lang $order preserves review, IDs and retries", ({ lang, order }) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-db-move-"));
  try {
    const vault = oldVault(root, lang);
    const before = [...vault.notes.values()].map((note) => [note.id, note.hash]).sort();
    for (const pack of order) updatePack(vault, PACKS, pack);
    assert.deepEqual([...Vault.load(vault.root).notes.values()].map((note) => [note.id, note.hash]).sort(), before);
    assert.equal(vault.listProposals().length, 36);
    for (const id of SHARED) {
      const pending = vault.getProposal(id);
      assert.equal(pending?.meta.proposed_by, "pack:databases@1.0.0");
      assert.equal(pending?.meta.action, "update");
      assert.equal(pending?.meta.base_hash, vault.get(id)?.hash);
      assert.equal(pending?.data.pack_lang, lang);
    }
    const inbox = vault.listProposals().map((proposal) => fs.readFileSync(proposal.path, "utf8"));
    for (const pack of order) updatePack(vault, PACKS, pack);
    assert.deepEqual(
      vault.listProposals().map((proposal) => fs.readFileSync(proposal.path, "utf8")),
      inbox,
    );
    const rejected = vault.rejectMany();
    assert.deepEqual(rejected.failed, []);
    assert.equal(rejected.rejected.length, 36);
    assert.deepEqual([...Vault.load(vault.root).notes.values()].map((note) => [note.id, note.hash]).sort(), before);
    for (const pack of order) updatePack(vault, PACKS, pack);
    assert.equal(vault.listProposals().length, 36);
    // Partially approve dependency moves first, then retry at the already-installed shared version.
    vault.approve("postgresql");
    for (const pack of order) updatePack(vault, PACKS, pack);
    assert.equal(vault.getProposal("sqlite")?.meta.proposed_by, "pack:databases@1.0.0");
    const approved = vault.approveMany();
    assert.deepEqual(approved.failed, []);
    assert.equal(approved.approved.length, 35);
    assert.deepEqual(vault.issues, []);
    assert.equal(vault.notes.size, 41);
    assert.deepEqual(
      [...vault.notes.keys()].sort(),
      before.map(([id]) => id),
    );
    assert.deepEqual(installedPacks(vault), { "core-layers": "1.0.0", databases: "1.0.0", "python-api": "1.2.0", "rust-api": "1.1.0" });
    for (const id of SHARED) assert.equal(vault.get(id)?.data.source, "pack:databases@1.0.0");
    for (const pack of order) assert.equal(updatePack(vault, PACKS, pack).upToDate, true);
    assert.deepEqual(vault.listProposals(), []);
    installPack(vault, PACKS, "go-api", { lang });
    assert.equal(vault.notes.size, 68);
    assert.deepEqual(vault.issues, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("migration preserves manual ownership, pending agent work and concurrent-edit conflict protection", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-db-conflicts-"));
  try {
    const vault = oldVault(root, "en");
    const postgres = vault.get("postgresql");
    const sqlite = vault.get("sqlite");
    assert.ok(postgres && sqlite);
    vault.writeNote(postgres.id, { ...postgres.data, source: "manual" }, `${postgres.body}\nCustom database guidance.`);
    vault.propose(sqlite.id, sqlite.data, `${sqlite.body}\nAgent learning.`, { proposed_by: "agent:test", reason: "pending review" });
    const pending = fs.readFileSync(vault.getProposal("sqlite")?.path as string, "utf8");
    const manualHash = vault.get("postgresql")?.hash;
    const result = updatePack(vault, PACKS, "python-api");
    assert.ok(result.skipped.includes("postgresql") && result.skipped.includes("sqlite"));
    assert.equal(vault.getProposal("postgresql"), undefined);
    assert.equal(vault.get("postgresql")?.hash, manualHash);
    assert.equal(fs.readFileSync(vault.getProposal("sqlite")?.path as string, "utf8"), pending);
    const practice = vault.get("sql-migrations");
    assert.ok(practice);
    vault.writeNote(practice.id, practice.data, `${practice.body}\nLocal edit after proposal.`);
    assert.throws(() => vault.approve(practice.id), /changed since this proposal/);
    updatePack(vault, PACKS, "python-api");
    assert.throws(() => vault.approve(practice.id), /changed since this proposal/);
    assert.match(vault.get(practice.id)?.body ?? "", /Local edit/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("dependency cycles fail before creating migration proposals", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-db-cycle-"));
  try {
    const vault = oldVault(root, "en");
    const packs = path.join(root, "next");
    fs.cpSync(PACKS, packs, { recursive: true });
    const file = path.join(packs, "databases", "pack.json");
    fs.writeFileSync(file, JSON.stringify({ ...readPack(packs, "databases"), requires: ["python-api"] }));
    assert.throws(() => updatePack(vault, packs, "python-api"), /dependency cycle/);
    assert.deepEqual(vault.listProposals(), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an older bundle cannot downgrade a newer shared pack during a handoff", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-db-newer-"));
  try {
    const vault = oldVault(root, "en");
    const postgres = vault.get("postgresql");
    assert.ok(postgres);
    vault.writeNote(postgres.id, { ...postgres.data, source: "pack:databases@9.0.0" }, postgres.body);
    updatePack(vault, PACKS, "python-api");
    assert.equal(
      vault.listProposals().some((proposal) => proposal.meta.proposed_by.startsWith("pack:databases@")),
      false,
    );
    assert.equal(vault.get("postgresql")?.data.source, "pack:databases@9.0.0");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an existing preview Go pack updates its dependency-only version through review", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-db-go-preview-"));
  try {
    const vault = oldVault(root, "en");
    installPack(vault, path.join(root, "legacy"), "go-api");
    assert.equal(installedPacks(vault)["go-api"], "1.0.0");
    const before = [...vault.notes.keys()].sort();
    updatePack(vault, PACKS, "go-api");
    assert.equal(vault.listProposals().length, 30);
    assert.equal(vault.get("go")?.data.source, "pack:go-api@1.0.0");
    assert.deepEqual(vault.approveMany().failed, []);
    assert.equal(installedPacks(vault)["go-api"], "1.1.0");
    assert.deepEqual([...vault.notes.keys()].sort(), before);
    assert.equal(updatePack(vault, PACKS, "go-api").upToDate, true);
    assert.deepEqual(vault.issues, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test.each(["en", "es"])("migration keeps pre-update edits in all handoffs and 33 version refreshes (%s)", (lang) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-db-edited-"));
  const content = (note: { data: Record<string, unknown>; body: string }) => {
    const data = { ...note.data };
    delete data.source;
    delete data.updated;
    return { data, body: note.body };
  };
  try {
    const vault = oldVault(root, lang);
    for (const note of vault.notes.values()) {
      if (!/^pack:(python-api|rust-api)@/.test(note.data.source)) continue;
      vault.writeNote(
        note.id,
        {
          ...note.data,
          title: `${note.data.title ?? note.id} - local`,
          tags: [...note.data.tags, `local-${lang}`],
        },
        `${note.body}\nUser edit before update: ${note.id} ${lang}.`,
        { reload: false },
      );
    }
    vault.reload();
    const before = new Map([...vault.notes.values()].map((note) => [note.id, content(note)]));
    updatePack(vault, PACKS, "python-api");
    updatePack(vault, PACKS, "rust-api");
    assert.equal(vault.listProposals().length, 36);
    for (const proposal of vault.listProposals()) {
      assert.deepEqual(content(proposal), before.get(proposal.id));
      assert.equal(proposal.meta.base_hash, vault.get(proposal.id)?.hash);
    }
    updatePack(vault, PACKS, "python-api");
    updatePack(vault, PACKS, "rust-api");
    const result = vault.approveMany();
    assert.deepEqual(result.failed, []);
    assert.equal(result.approved.length, 36);
    const fresh = Vault.load(vault.root);
    assert.equal(fresh.notes.size, 41);
    for (const note of fresh.notes.values()) assert.deepEqual(content(note), before.get(note.id));
    for (const id of SHARED) assert.equal(fresh.get(id)?.data.source, "pack:databases@1.0.0");
    assert.equal(fresh.get("fastapi")?.data.source, "pack:python-api@1.2.0");
    assert.equal(fresh.get("rust")?.data.source, "pack:rust-api@1.1.0");
    assert.deepEqual(fresh.issues, []);
    assert.equal(updatePack(fresh, PACKS, "python-api").upToDate, true);
    assert.equal(updatePack(fresh, PACKS, "rust-api").upToDate, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
