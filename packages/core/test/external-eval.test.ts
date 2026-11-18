import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { auditDataset } from "../../../scripts/eval/audit-github.mjs";
import {
  buildDataset,
  cleanDescription,
  descriptionLanguage,
  MANIFESTS,
  readmeIntro,
  rejection,
  repositoryCase,
  SEED,
  STACKS,
  splitCases,
} from "../../../scripts/eval/github-data.mjs";
import { metricRows, regressions, rowKey } from "../../../scripts/eval/metrics.mjs";
import { mine } from "../../../scripts/eval/mine-github.mjs";
import { evaluate, installPack, listPacks, type Recommendation, Vault } from "../src/index.js";

const PACKS = path.resolve(import.meta.dirname, "../../../packs");

test("published GitHub corpus has immutable provenance, balanced stacks and a frozen 105/45 split", () =>
  withVault((vault) => {
    const file = path.resolve(import.meta.dirname, "../../../scripts/eval/github-repos.json");
    const dataset = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(dataset.schema_version, 1);
    assert.equal(dataset.seed, SEED);
    assert.equal(dataset.cases.length, 150);
    assert.equal(new Set(dataset.cases.map((c) => c.id)).size, 150);
    assert.equal(new Set(dataset.cases.map((c) => c.repo)).size, 150);
    assert.equal(dataset.cases.filter((c) => c.split === "tune").length, 105);
    assert.equal(dataset.cases.filter((c) => c.split === "held-out").length, 45);
    for (const stack of STACKS) assert.equal(dataset.cases.filter((c) => c.stack === stack).length, 25);
    for (const c of dataset.cases) {
      assert.match(c.repo, /^https:\/\/github\.com\/[^/]+\/[^/]+$/);
      assert.match(c.commit_sha, /^[a-f0-9]{40}$/);
      assert.equal(c.lang, "en");
      assert.ok(c.source_excerpt.split(/\s+/).length <= 25);
      assert.equal(c.originally_named_tech, c.indirect);
      assert.equal(c.repository_metadata.visibility, "public");
      assert.equal(c.repository_metadata.fork, false);
      assert.equal(c.repository_metadata.archived, false);
      assert.equal(c.repository_metadata.is_template, false);
      assert.ok(c.repository_metadata.size_kib >= 100 && c.repository_metadata.stargazers >= 5);
      assert.ok(Object.keys(c.expect).length >= 2);
      for (const [layer, expected] of Object.entries(c.expect))
        for (const id of (expected as { top3: string[] }).top3) {
          const note = vault.get(id);
          assert.ok(note?.data.type === "tech" && note.data.kind !== "language");
          assert.ok([note.data.layer].flat().includes(layer));
          assert.ok(c.evidence.some((e) => e.id === id && c.manifests.some((m) => m.path === e.source)));
        }
      for (const manifest of c.manifests) {
        assert.match(manifest.blob_sha, /^[a-f0-9]{40}$/);
        assert.match(manifest.sha256, /^[a-f0-9]{64}$/);
      }
    }
    const assignments = (rows) => rows.map((c) => `${c.id}:${c.split}`).sort();
    assert.deepEqual(
      assignments(
        splitCases(
          dataset.cases.map(({ split: _split, ...c }) => c),
          SEED,
        ),
      ),
      assignments(dataset.cases),
    );
    const labels = JSON.parse(
      fs.readFileSync(path.resolve(import.meta.dirname, "../../../scripts/eval/github-quality-labels.json"), "utf8"),
    );
    const quality = auditDataset(fs.readFileSync(file, "utf8"), labels);
    assert.equal(quality.cases.length, 150);
    assert.equal(quality.one_layer.length, 0);
    assert.equal(quality.empty.length, 0);
    assert.ok(quality.cases.every((c) => ["app", "library", "example", "mixed"].includes(c.category)));
    assert.throws(() => auditDataset(`${fs.readFileSync(file, "utf8")}\n`, labels), /different frozen corpus/);
  }));
function withVault(run: (vault: Vault, root: string) => unknown) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-external-test-"));
  const vault = Vault.load(root);
  for (const pack of listPacks(PACKS)) installPack(vault, PACKS, pack.name);
  return Promise.resolve()
    .then(() => run(vault, root))
    .finally(() => fs.rmSync(root, { recursive: true, force: true }));
}
test("MRR measures first relevant rank beyond top three and averages layer expectations", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-mrr-"));
  try {
    const vault = Vault.load(root);
    const result = evaluate(
      vault,
      [{ description: "demo", lang: "en", expect: { backend: { top3: ["right", "alternate"] }, data: { top3: ["absent"] } } }],
      () => ({ layers: { backend: ["one", "two", "three", "alternate"].map((id) => ({ id })), data: [] } }) as unknown as Recommendation,
    );
    assert.equal(result.hit1, 0);
    assert.equal(result.hit3, 0);
    assert.equal(result.mrr, 0.125);
    assert.equal(result.perCase[0].layers[0].reciprocalRank, 0.25);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("fixed seed stratification is order-independent, repo-disjoint and exactly 105/45", () => {
  const cases = STACKS.flatMap((stack) => Array.from({ length: 25 }, (_, i) => ({ stack, repo: `https://github.com/${stack}/${i}` })));
  const split = splitCases(cases, SEED);
  assert.deepEqual(splitCases([...cases].reverse(), SEED), split);
  assert.equal(split.filter((c) => c.split === "tune").length, 105);
  assert.equal(split.filter((c) => c.split === "held-out").length, 45);
  assert.equal(new Set(split.map((c) => c.repo)).size, 150);
  assert.notDeepEqual(splitCases(cases, "different-seed"), split);
});
test("repo quality and conservative English language filters reject invalid sources", () => {
  const meta = {
    name: "product",
    description: "An application for managing shared team work",
    visibility: "public",
    size: 100,
    stargazers_count: 5,
  };
  assert.equal(rejection(meta), undefined);
  for (const flag of ["fork", "archived", "is_template", "private", "disabled"]) assert.ok(rejection({ ...meta, [flag]: true }));
  assert.ok(rejection({ ...meta, size: 99 }));
  assert.ok(rejection({ ...meta, name: "starter-kit" }));
  assert.equal(descriptionLanguage("An application for managing your shared tasks"), "en");
  assert.equal(descriptionLanguage("Una aplicación para gestionar las tareas del equipo"), "unknown");
  assert.equal(descriptionLanguage("中文项目"), "unknown");
  assert.ok(readmeIntro("# Title\n\n![badge](url)\n\nAn application for managing your shared tasks.").startsWith("An application"));
});
test("case construction strips named techs and derives truth only from safe manifests, excluding language layers", () =>
  withVault((vault) => {
    const repo = {
      stack: "rust-api",
      metadata: {
        id: 1,
        name: "product",
        full_name: "owner/product",
        html_url: "https://github.com/owner/product",
        visibility: "public",
        size: 100,
        stargazers_count: 5,
        description: "An Axum Rust service for tracking shared inventory with reliable transactions",
      },
      commit_sha: "a".repeat(40),
      manifests: [{ path: "Cargo.toml", sha: "b".repeat(40), content: '[dependencies]\naxum="0.8"\nsqlx="0.8"\n' }],
    };
    const result = repositoryCase(repo, vault, PACKS);
    assert.ok(result.value);
    assert.equal(result.value.indirect, true);
    assert.doesNotMatch(result.value.description, /Axum|Rust/i);
    assert.deepEqual(result.value.expect, { backend: { top3: ["axum"] }, data: { top3: ["sqlx"] } });
    assert.equal(
      repositoryCase({ ...repo, manifests: [{ ...repo.manifests[0], content: '[dependencies]\naxum="0.8"\n' }] }, vault, PACKS).reason,
      "fewer than two non-language technology layers",
    );
    assert.throws(() => repositoryCase({ ...repo, manifests: [{ ...repo.manifests[0], path: "../Cargo.toml" }] }, vault, PACKS), /Unsafe/);
    assert.match(cleanDescription("A mobile app to share a poem with friends", vault).description, /poem/);
    assert.doesNotMatch(cleanDescription("A Poem service for managing shared project tasks", vault, ["poem"]).description, /poem/i);
    assert.doesNotMatch(
      cleanDescription("A ReactNative app for managing shared project tasks", vault, ["react-native"]).description,
      /reactnative/i,
    );
    const privateDump = {
      // A failed public-data filter must not publish private repository identities.
      seed: SEED,
      repositories: [{ ...repo, metadata: { ...repo.metadata, private: true, full_name: "private/secret-project" } }],
    };
    assert.doesNotMatch(JSON.stringify(buildDataset(privateDump, vault, PACKS, 6)), /secret-project/);
    assert.ok(MANIFESTS.has("pubspec.yaml"));
    assert.doesNotMatch(
      cleanDescription("A service for managing your tasks https://example.test/RocketProject", vault).description,
      /https|RocketProject/i,
    );
  }));
test("regression gate rejects each metric, missing partitions and changed fixture identity", () => {
  const entries = [{ indirect: true, split: "held-out", forbidViolations: 0, layers: [{ hit1: true, hit3: true, reciprocalRank: 1 }] }];
  const rows = metricRows("github", "keywords", entries);
  const baseline = { fingerprints: { github: "fixed" }, rows: Object.fromEntries(rows.map((r) => [rowKey(r), r])) };
  assert.deepEqual(regressions(rows, baseline, { github: "fixed" }), []);
  assert.ok(
    regressions(
      rows.map((r) => ({ ...r, forbid: 1 })),
      baseline,
      { github: "fixed" },
    ).some((s) => s.includes("forbid")),
  );
  assert.ok(
    regressions(
      rows.map((r) => ({ ...r, cases: 2 })),
      baseline,
      { github: "fixed" },
    ).some((s) => s.includes("count")),
  );
  for (const metric of ["hit1", "hit3", "mrr"])
    assert.ok(
      regressions(
        rows.map((r) => ({ ...r, [metric]: 0.99 })),
        baseline,
        { github: "fixed" },
      ).some((s) => s.includes(metric)),
    );
  assert.ok(regressions(rows, baseline, { github: "edited" }).some((s) => s.includes("fingerprint")));
  assert.ok(
    regressions(
      rows.filter((r) => r.split !== "held-out"),
      baseline,
      { github: "fixed" },
    ).some((s) => s.includes("disappeared")),
  );
});
test("baseline validation rejects missing metric values", () => {
  const rows = metricRows("github", "keywords", [
    { indirect: true, forbidViolations: 0, layers: [{ hit1: true, hit3: true, reciprocalRank: 1 }] },
  ]);
  const baseline = { fingerprints: { github: "fixed" }, rows: Object.fromEntries(rows.map((r) => [rowKey(r), { ...r, mrr: undefined }])) };
  assert.ok(regressions(rows, baseline, { github: "fixed" }).some((s) => s.includes("missing/invalid")));
});

test("apps-only rows gate each split even when full-corpus metrics stay unchanged", () => {
  const entry = (category: string, split: string, hit: boolean) => ({
    category,
    split,
    forbidViolations: 0,
    layers: [{ hit1: hit, hit3: hit, reciprocalRank: Number(hit) }],
  });
  const rows = metricRows("github", "keywords", [
    entry("app", "tune", true),
    entry("library", "tune", false),
    entry("app", "held-out", true),
  ]);
  const baseline = { fingerprints: { github: "fixed" }, rows: Object.fromEntries(rows.map((r) => [rowKey(r), r])) };
  const changed = metricRows("github", "keywords", [
    entry("app", "tune", false),
    entry("library", "tune", true),
    entry("app", "held-out", true),
  ]);
  assert.equal(changed.find((r) => r.split === "all")?.hit1, rows.find((r) => r.split === "all")?.hit1);
  assert.equal(rows.find((r) => r.split === "apps-only/all")?.cases, 2);
  assert.ok(regressions(changed, baseline, { github: "fixed" }).some((s) => s.includes("apps-only/tune hit1")));
  assert.ok(
    regressions(
      changed.filter((r) => r.split !== "apps-only/held-out"),
      baseline,
      { github: "fixed" },
    ).some((s) => s.includes("disappeared")),
  );
  const empty = metricRows("github", "keywords", [entry("example", "tune", true)]);
  assert.equal(empty.find((r) => r.split === "apps-only/tune")?.cases, 0);
  assert.equal(empty.find((r) => r.split === "apps-only/tune")?.mrr, 0);
});

test("cached raw dump replays offline without invoking gh or modifying raw input", { timeout: 60_000 }, async () =>
  withVault(async (vault, root) => {
    const deps = {
      "web-typescript": { "package.json": JSON.stringify({ dependencies: { react: "19", vitest: "3" } }) },
      "python-api": { "requirements.txt": "fastapi\npytest\n" },
      "rust-api": { "Cargo.toml": '[dependencies]\naxum="0.8"\nsqlx="0.8"\n' },
      "go-api": { "go.mod": "require github.com/gin-gonic/gin v1.0.0\nrequire gorm.io/gorm v1.0.0\n" },
      mobile: { "pubspec.yaml": "dependencies:\n  flutter: {sdk: flutter}\n  drift: ^2.0.0\n" },
      "data-ml": { "requirements.txt": "pandas\nscikit-learn\n" },
    };
    const repositories = STACKS.map((stack, i) => ({
      stack,
      metadata: {
        id: i + 1,
        name: `product-${i}`,
        full_name: `owner/product-${i}`,
        html_url: `https://github.com/owner/product-${i}`,
        visibility: "public",
        size: 100,
        stargazers_count: 5,
        description: `An application for managing your shared tasks in department ${i}`,
      },
      commit_sha: "a".repeat(40),
      manifests: Object.entries(deps[stack]).map(([path, content]) => ({ path, content, sha: "b".repeat(40) })),
    }));
    const raw = { schema_version: 1, seed: SEED, repositories };
    const rawFile = path.join(root, "raw.json"),
      outFile = path.join(root, "cases.json");
    fs.writeFileSync(rawFile, JSON.stringify(raw));
    const bytes = fs.readFileSync(rawFile, "utf8");
    const result = await mine({ rawFile, outFile, target: 6, offline: true }, () => {
      throw new Error("network forbidden");
    });
    assert.equal(result.cases.length, 6);
    assert.equal(fs.readFileSync(rawFile, "utf8"), bytes);
    assert.deepEqual(result, buildDataset(raw, vault, PACKS, 6));
    const published = fs.readFileSync(outFile, "utf8");
    await assert.rejects(mine({ rawFile, outFile, target: 12, offline: true }), /refusing to publish an undersized set/);
    assert.equal(fs.readFileSync(outFile, "utf8"), published);
    fs.appendFileSync(outFile, "\n");
    const frozen = fs.readFileSync(outFile, "utf8");
    await assert.rejects(mine({ rawFile, outFile, target: 6, offline: true }), /existing frozen dataset/);
    assert.equal(fs.readFileSync(outFile, "utf8"), frozen);
  }),
);

test("online transport pins manifest blobs to a commit and its cache replays byte-for-byte offline", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-gh-transport-"));
  try {
    const definitions = [
      ["package.json", JSON.stringify({ dependencies: { react: "19", vitest: "3" } })],
      ["requirements.txt", "fastapi\npytest\n"],
      ["Cargo.toml", '[dependencies]\naxum="0.8"\nsqlx="0.8"\n'],
      ["go.mod", "require github.com/gin-gonic/gin v1.0.0\nrequire gorm.io/gorm v1.0.0\n"],
      ["pubspec.yaml", "dependencies:\n  flutter: {sdk: flutter}\n  drift: ^2.0.0\n"],
      ["requirements.txt", "pandas\nscikit-learn\n"],
    ];
    let searches = 0;
    const calls: string[] = [];
    const transport = async (endpoint: string) => {
      calls.push(endpoint);
      if (endpoint.startsWith("search/")) return { incomplete_results: false, items: [{ full_name: `owner/app-${searches++}` }] };
      const index = Number(/owner\/app-(\d+)/.exec(endpoint)?.[1]);
      if (/^repos\/owner\/app-\d+$/.test(endpoint))
        return {
          id: index + 1,
          name: `app-${index}`,
          full_name: `owner/app-${index}`,
          html_url: `https://github.com/owner/app-${index}`,
          visibility: "public",
          size: 100,
          stargazers_count: 5,
          default_branch: "main",
          description: `An application for managing your shared tasks in department ${index}`,
        };
      if (endpoint.includes("/commits/")) return { sha: "a".repeat(40) };
      if (endpoint.includes("/git/trees/")) {
        assert.ok(endpoint.includes("a".repeat(40)));
        return {
          truncated: false,
          tree: [
            { type: "blob", path: definitions[index][0], size: 100, sha: "b".repeat(40) },
            { type: "blob", path: "unrelated.txt", size: 100, sha: "c".repeat(40) },
          ],
        };
      }
      if (endpoint.endsWith(`/git/blobs/${"b".repeat(40)}`))
        return { encoding: "base64", content: Buffer.from(definitions[index][1]).toString("base64") };
      throw new Error(`Unexpected API endpoint ${endpoint}`);
    };
    const rawFile = path.join(root, "raw.json"),
      outFile = path.join(root, "cases.json");
    await mine({ rawFile, outFile, target: 6 }, transport);
    const first = fs.readFileSync(outFile, "utf8");
    assert.equal(searches, 6);
    assert.equal(calls.filter((s) => s.includes("/git/blobs/")).length, 6);
    await mine({ rawFile, outFile, target: 6, offline: true }, () => {
      throw new Error("no network");
    });
    assert.equal(fs.readFileSync(outFile, "utf8"), first);
    const cache = JSON.parse(fs.readFileSync(rawFile, "utf8"));
    assert.ok(
      Object.entries(cache.api_cache)
        .filter(([key]) => key.includes("/git/trees/"))
        .every(([, value]) => (value as { tree: unknown[] }).tree.length === 1),
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
