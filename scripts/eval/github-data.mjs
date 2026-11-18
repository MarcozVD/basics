import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cargoPackages, goPackages, pubPackages } from "../../packages/core/dist/detection-packages.js";
import { detectStack, packNotes } from "../../packages/core/dist/index.js";
import { techNameContext } from "../../packages/core/dist/tech-names.js";

export const SEED = "basics-github-v1-2026-11-17";
export const STACKS = ["web-typescript", "python-api", "rust-api", "go-api", "mobile", "data-ml"];
export const MANIFESTS = new Set([
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pyproject.toml",
  "requirements.txt",
  "requirements-dev.txt",
  "pubspec.yaml",
]);
export const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
export const compareText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
export const ordered = (items, seed, key) => [...items].sort((a, b) => compareText(hash(`${seed}:${key(a)}`), hash(`${seed}:${key(b)}`)));
const enWords = new Set(
  "a an the with for from in to and of is your that this build built manage management data application app service server tool platform system open source simple provides allows users tracking analysis dashboard online self hosted".split(
    " ",
  ),
);
const foreign = new Set("un una une le la les des para los las por del que el et avec une der die das und ein eine mit für".split(" "));
export function descriptionLanguage(text) {
  if (/[^\p{Script=Latin}\p{M}\p{N}\p{P}\p{S}\p{Z}\s]/u.test(text)) return "unknown";
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const en = words.filter((word) => enWords.has(word)).length;
  const other = words.filter((word) => foreign.has(word)).length;
  return en >= 2 && en > other ? "en" : "unknown";
}
export function readmeIntro(text) {
  const clean = text.replace(/```[\s\S]*?```/g, "").replace(/<!--[\s\S]*?-->/g, "");
  for (const paragraph of clean.split(/\n\s*\n/)) {
    if (/^\s*(?:#|[!<|]|\[.*\]:)/.test(paragraph)) continue;
    const prose = paragraph
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]*>/g, "")
      .replace(/[`*_]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (prose.split(/\s+/).length >= 6) return prose.split(/\s+/).slice(0, 25).join(" ");
  }
  return "";
}
const regexEscape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function cleanDescription(text, vault, detectedIds = []) {
  const named = new Set([...techNameContext(vault.byType("tech"), text).named, ...detectedIds]);
  const aliases = vault
    .byType("tech")
    .filter((note) => named.has(note.id))
    .flatMap((note) => [note.id, note.data.title ?? note.id, ...Object.values(note.data.packages ?? {}).flat()]);
  aliases.push("JavaScript", "JS", "TS", "Golang", "Postgres");
  for (const [alias, id] of Object.entries({ ...cargoPackages, ...goPackages, ...pubPackages })) if (named.has(id)) aliases.push(alias);
  let description = text;
  const removed = [];
  for (const name of [...new Set(aliases)].sort((a, b) => b.length - a.length)) {
    const pattern = name
      .split(/[\s._/-]+/)
      .map(regexEscape)
      .join("[\\s._/-]*");
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${pattern}(?![\\p{L}\\p{N}])`, "giu");
    if (re.test(description)) {
      removed.push(name);
      description = description.replace(re, " ");
    }
  }
  description = description
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s,;:./+-]+|[\s,;:/+-]+$/g, "")
    .trim();
  return { description, indirect: removed.length > 0, originally_named_tech: removed.length > 0, removed_names: removed.sort() };
}
export function rejection(meta) {
  if (meta.private || meta.visibility !== "public" || meta.fork || meta.archived || meta.disabled || meta.is_template)
    return "not an active public original repository";
  if (meta.size < 100 || meta.stargazers_count < 5) return "tiny repository (minimum 100 KiB and 5 stars)";
  if (
    /\b(template|boilerplate|starter|tutorial|course|awesome|examples?)\b/i.test(
      `${meta.name.replaceAll("_", "-")} ${meta.description ?? ""}`,
    )
  )
    return "template/tutorial/collection";
}
export function safeManifest(file) {
  return (
    typeof file.path === "string" &&
    !/[\\:]/.test(file.path) &&
    !file.path.startsWith("/") &&
    !file.path.split("/").some((part) => part === ".." || part === ".") &&
    MANIFESTS.has(path.posix.basename(file.path)) &&
    typeof file.content === "string" &&
    Buffer.byteLength(file.content) <= 262144
  );
}
export function repositoryCase(repo, vault, packsDir) {
  const reason = rejection(repo.metadata);
  if (reason) return { reason };
  if (!/^[0-9a-f]{40}$/.test(repo.commit_sha)) return { reason: "missing immutable commit" };
  const meta = repo.metadata;
  const sources = [
    ["repository-description", meta.description ?? ""],
    ["readme-intro", repo.readme?.intro ?? ""],
  ]
    .map(([kind, text]) => [kind, text.split(/\s+/).slice(0, 25).join(" ")])
    .filter(([, text]) => descriptionLanguage(text) === "en");
  if (!sources.length) return { reason: "non-English or uncertain description language", language: "unknown" };
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-github-detect-"));
  const detections = [];
  try {
    const dirs = new Set();
    for (const file of repo.manifests ?? []) {
      if (!safeManifest(file)) throw new Error(`Unsafe cached manifest path/content: ${file.path}`);
      const dest = path.resolve(root, file.path);
      if (!dest.startsWith(`${root}${path.sep}`)) throw new Error("Manifest escapes scratch directory");
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, file.content);
      dirs.add(path.dirname(dest));
    }
    for (const dir of [...dirs].sort())
      for (const tech of detectStack(vault, dir).techs)
        detections.push({ ...tech, source: path.relative(root, path.join(dir, tech.source)).split(path.sep).join("/") });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  const expect = {};
  const evidence = [];
  for (const detected of detections) {
    const note = vault.get(detected.id);
    if (note?.data.type !== "tech" || note.data.kind === "language") continue;
    evidence.push(detected);
    for (const layer of [note.data.layer].flat()) {
      expect[layer] ??= { top3: [] };
      if (!expect[layer].top3.includes(note.id)) expect[layer].top3.push(note.id);
    }
  }
  for (const layer of Object.values(expect)) layer.top3.sort();
  if (Object.keys(expect).length < 2) return { reason: "fewer than two non-language technology layers" };
  const stackIds = new Set(
    packNotes(packsDir, repo.stack, "en")
      .filter((note) => note.data.type === "tech" && note.data.kind !== "language")
      .map((note) => note.id),
  );
  if (!evidence.some((tech) => stackIds.has(tech.id))) return { reason: "no manifest evidence for sampling stack" };
  let selected;
  for (const [kind, original] of sources) {
    const cleaned = cleanDescription(
      original,
      vault,
      detections.map((tech) => tech.id),
    );
    if (cleaned.description.split(/\s+/).length < 5) continue;
    selected = { ...cleaned, description_source: kind, source_excerpt: original };
    break;
  }
  if (!selected) return { reason: "insufficient description after removing technology names", language: "en" };
  return {
    value: {
      id: `github:${meta.id}`,
      repo: meta.html_url,
      commit_sha: repo.commit_sha,
      stack: repo.stack,
      repository_metadata: {
        full_name: meta.full_name,
        visibility: meta.visibility,
        fork: Boolean(meta.fork),
        archived: Boolean(meta.archived),
        is_template: Boolean(meta.is_template),
        size_kib: meta.size,
        stargazers: meta.stargazers_count,
      },
      lang: "en",
      ...selected,
      expect,
      evidence,
      manifests: repo.manifests.map(({ path, sha, content }) => ({ path, blob_sha: sha, sha256: hash(content) })),
      ...(repo.readme ? { readme: { path: repo.readme.path, blob_sha: repo.readme.sha } } : {}),
    },
  };
}
export function splitCases(cases, seed) {
  const groups = STACKS.map((stack) => ({
    stack,
    cases: ordered(
      cases.filter((c) => c.stack === stack),
      seed,
      (c) => c.repo,
    ),
  }));
  const remainder = Math.round(cases.length * 0.7) - groups.reduce((sum, g) => sum + Math.floor(g.cases.length * 0.7), 0);
  const extras = new Set(
    ordered(
      groups.filter((g) => (g.cases.length * 0.7) % 1 > 0),
      seed,
      (g) => g.stack,
    )
      .sort((a, b) => ((b.cases.length * 0.7) % 1) - ((a.cases.length * 0.7) % 1))
      .slice(0, remainder)
      .map((g) => g.stack),
  );
  return groups
    .flatMap((g) =>
      g.cases.map((c, i) => ({ ...c, split: i < Math.floor(g.cases.length * 0.7) + Number(extras.has(g.stack)) ? "tune" : "held-out" })),
    )
    .sort((a, b) => compareText(a.repo, b.repo));
}
export function buildDataset(raw, vault, packsDir, target = 150) {
  const cases = [],
    rejected = [],
    seenRepo = new Set(),
    seenDescription = new Set();
  for (const stack of STACKS) {
    const quota = Math.floor(target / STACKS.length) + Number(STACKS.indexOf(stack) < target % STACKS.length);
    let count = 0;
    for (const repo of ordered(
      raw.repositories.filter((r) => r.stack === stack),
      raw.seed,
      (r) => r.metadata.full_name,
    )) {
      if (count >= quota) break;
      const { value, reason, language } = repositoryCase(repo, vault, packsDir);
      if (!value) {
        // Rejection logs are public too; never expose private repository names.
        if (repo.metadata.private || repo.metadata.visibility !== "public") continue;
        rejected.push({ repo: repo.metadata.full_name, reason, language });
        continue;
      }
      const key = value.description.toLowerCase().replace(/\W/g, "");
      if (seenRepo.has(value.id) || seenDescription.has(key)) {
        rejected.push({ repo: repo.metadata.full_name, reason: "duplicate repository or description" });
        continue;
      }
      seenRepo.add(value.id);
      seenDescription.add(key);
      cases.push(value);
      count++;
    }
  }
  return {
    schema_version: 1,
    source: "GitHub REST API via gh api",
    seed: raw.seed,
    split_policy: "70/30 stratified seeded SHA-256 ordering; largest remainder allocation",
    sampling: { target, minimum_size_kib: 100, minimum_stars: 5, minimum_nonlanguage_layers: 2 },
    cases: splitCases(cases, raw.seed),
    rejected,
  };
}
