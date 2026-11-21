import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installPack, listPacks, serializeNote, Vault } from "../../packages/core/dist/index.js";
import { fresh, hash, json, repoRoot, treeHash } from "./common.mjs";

export function buildStudyVault(output) {
  fresh(output);
  const source = path.join(repoRoot, "examples/vault"),
    example = Vault.load(source);
  const originals = new Set();
  for (const note of example.notes.values()) {
    const relative = path.relative(source, note.path),
      target = path.join(output, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(note.path, target);
    originals.add(note.id);
  }
  const vault = Vault.load(output),
    packs = [],
    collisions = [];
  for (const pack of listPacks(path.join(repoRoot, "packs")).sort((a, b) => a.name.localeCompare(b.name, "en"))) {
    const result = installPack(vault, path.join(repoRoot, "packs"), pack.name, { lang: "en" });
    packs.push({ name: pack.name, version: pack.version });
    for (const id of result.skipped) collisions.push({ pack: pack.name, id, retained_source: vault.get(id).data.source });
  }
  for (const note of vault.notes.values())
    if (!originals.has(note.id)) fs.writeFileSync(note.path, serializeNote({ ...note.data, updated: "2026-11-20" }, note.body));
  vault.reload();
  if (vault.issues.length) throw new Error(`Study vault invalid: ${vault.issues.map((issue) => issue.message).join("; ")}`);
  return {
    hash: treeHash(output),
    examples_hash: hash(
      [...example.notes.values()]
        .map((note) => [path.relative(source, note.path).split(path.sep).join("/"), hash(fs.readFileSync(note.path))])
        .sort(),
    ),
    packs,
    collisions,
    notes: vault.notes.size,
    language: "preserved examples plus English packs",
    embeddings: false,
  };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(json(buildStudyVault(path.resolve(process.argv[2] ?? "study-vault"))));
