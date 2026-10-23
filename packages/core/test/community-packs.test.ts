import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, test } from "vitest";
import {
  addCommunityPack,
  communityPackDir,
  installedPacks,
  isCommunityPackName,
  PackDownloadError,
  removeCommunityPack,
  updateCommunityPack,
  Vault,
} from "../src/index.js";
import { buildTarGz, fixtureEntries } from "./tar-builder.js";

const VAULTS: string[] = [];
const originalFetch = globalThis.fetch;

function tempVault(): Vault {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-community-"));
  VAULTS.push(dir);
  return Vault.load(dir);
}

/** Point the pack fetcher at a canned tar.gz, no network involved. */
function stubFetch(gzipped: Buffer, status = 200): void {
  globalThis.fetch = (() => {
    return Promise.resolve(new Response(gzipped, { status, headers: { "content-type": "application/gzip" } }));
  }) as typeof fetch;
}

beforeAll(() => {
  const previous = process.env.BASICS_PACK_FETCH_BASE;
  process.env.BASICS_PACK_FETCH_BASE = "https://codeload.invalid";
  return () => {
    if (previous === undefined) delete process.env.BASICS_PACK_FETCH_BASE;
    else process.env.BASICS_PACK_FETCH_BASE = previous;
  };
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  for (const dir of VAULTS) fs.rmSync(dir, { recursive: true, force: true });
});

describe("community pack name validation", () => {
  test("accepts owner/repo and rejects traversal and bundled-style names", () => {
    assert.equal(isCommunityPackName("marcozvd/python-api"), true);
    assert.equal(isCommunityPackName("a/b.c-d_1"), true);
    assert.equal(isCommunityPackName("python-api"), false);
    assert.equal(isCommunityPackName(".. /evil"), false);
    assert.equal(isCommunityPackName("Owner/Repo"), false);
    assert.equal(isCommunityPackName("/abs/repo"), false);
    assert.equal(isCommunityPackName("owner/.."), false);
  });

  test("add rejects a bad repo shape before any fetch", async () => {
    stubFetch(buildTarGz(fixtureEntries()));
    await assert.rejects(() => addCommunityPack(tempVault(), { owner: "evil", repo: ".." }), /evil/);
  });
});

describe("installedPacks with slash names", () => {
  test("parses pack:owner/repo@version", async () => {
    const vault = tempVault();
    stubFetch(buildTarGz(fixtureEntries("1.2.3")));
    await addCommunityPack(vault, { owner: "marcozvd", repo: "cool-pack" });
    const proposal = vault.listProposals()[0];
    assert.ok(proposal);
    assert.match(proposal.meta.proposed_by, /^pack:marcozvd\/cool-pack@/);
    vault.approve(proposal.id);
    assert.deepEqual(installedPacks(vault), { "marcozvd/cool-pack": "1.2.3" });
  });
});

describe("addCommunityPack", () => {
  test("proposes new notes from the right agent and caches the pack", async () => {
    const vault = tempVault();
    stubFetch(buildTarGz(fixtureEntries("1.0.0")));
    const result = await addCommunityPack(vault, { owner: "marcozvd", repo: "cool-pack" });

    assert.equal(result.name, "marcozvd/cool-pack");
    assert.equal(result.version, "1.0.0");
    assert.deepEqual(result.proposed_new, ["thing"]);
    assert.deepEqual(result.proposed_changed, []);
    assert.deepEqual(result.unchanged, []);
    assert.deepEqual(result.skipped, []);
    assert.deepEqual(result.invalid, []);

    const proposals = vault.listProposals();
    assert.equal(proposals.length, 1);
    assert.equal(proposals[0].meta.proposed_by, "pack:marcozvd/cool-pack@1.0.0");
    assert.equal(proposals[0].data.pack_lang, "en");
    assert.match(proposals[0].body ?? "", /Community note/);

    const cacheDir = communityPackDir(vault, "marcozvd/cool-pack");
    assert.ok(fs.existsSync(path.join(cacheDir, "pack.json")));
    const source = JSON.parse(fs.readFileSync(path.join(cacheDir, "source.json"), "utf8"));
    assert.equal(source.repo, "marcozvd/cool-pack");
    assert.equal(source.ref, "HEAD");
    assert.equal(source.version, "1.0.0");
    assert.ok(fs.existsSync(path.join(cacheDir, "notes", "en", "tech", "thing.md")));
    assert.ok(!fs.existsSync(path.join(cacheDir, "notes", "en", "README.md")));
  });

  test("honors --lang and --path", async () => {
    const vault = tempVault();
    const entries = [
      { path: "repo", type: "dir" },
      { path: "repo/sub", type: "dir" } as const,
      {
        path: "repo/sub/pack.json",
        data: JSON.stringify({ name: "sub", version: "0.1.0", description: { en: "sub" }, languages: ["es"] }),
      },
      {
        path: "repo/sub/notes/es/practices/nice.md",
        data: `---
type: practice
title: Nice
applies_to: [thing]
tags: []
---
# Nice
`,
      },
    ];
    stubFetch(buildTarGz(entries as never));
    const result = await addCommunityPack(vault, { owner: "o", repo: "r", path: "sub", lang: "es", ref: "v1" });
    assert.equal(result.version, "0.1.0");
    assert.equal(result.ref, "v1");
    assert.deepEqual(result.proposed_new, ["nice"]);
    const proposal = vault.listProposals()[0];
    assert.equal(proposal?.data.pack_lang, "es");
    assert.match(proposal?.body ?? "", /# Nice/);
  });

  test("skips invalid notes and reports them", async () => {
    const vault = tempVault();
    const entries = [
      { path: "repo", type: "dir" },
      {
        path: "repo/pack.json",
        data: JSON.stringify({ name: "p", version: "2.0.0", description: { en: "p" }, languages: ["en"] }),
      },
      {
        path: "repo/notes/en/tech/good.md",
        data: `---
type: tech
kind: library
title: Good
layer: backend
tags: []
---
# Good
`,
      },
      { path: "repo/notes/en/tech/bad.md", data: "---\ntype: nope\n---\nbad\n" },
      { path: "repo/notes/en/checks/not-under-type-dir.md", data: "ignored\n" },
    ];
    stubFetch(buildTarGz(entries as never));
    const result = await addCommunityPack(vault, { owner: "o", repo: "r" });
    assert.deepEqual(result.proposed_new, ["good"]);
    assert.equal(result.invalid.length, 1);
    assert.match(result.invalid[0].file, /bad\.md$/);
    assert.equal(vault.listProposals().length, 1);
  });

  test("404 surfaces a not-found error", async () => {
    const vault = tempVault();
    stubFetch(Buffer.from("nope"), 404);
    await assert.rejects(() => addCommunityPack(vault, { owner: "o", repo: "r" }), PackDownloadError);
  });

  test("invalid manifest is rejected", async () => {
    const vault = tempVault();
    const entries = [
      { path: "repo", type: "dir" },
      { path: "repo/pack.json", data: JSON.stringify({ name: "broken" }) },
      { path: "repo/notes/en/tech/x.md", data: "x\n" },
    ];
    stubFetch(buildTarGz(entries as never));
    await assert.rejects(() => addCommunityPack(vault, { owner: "o", repo: "r" }), PackDownloadError);
  });

  test("no pack.json is rejected", async () => {
    const vault = tempVault();
    const entries = [
      { path: "repo", type: "dir" },
      { path: "repo/readme.md", data: "hi" },
    ];
    stubFetch(buildTarGz(entries as never));
    await assert.rejects(() => addCommunityPack(vault, { owner: "o", repo: "r" }), /no pack\.json/);
  });
});

describe("updateCommunityPack", () => {
  test("no-ops on the same version without new proposals", async () => {
    const vault = tempVault();
    stubFetch(buildTarGz(fixtureEntries("1.0.0")));
    await addCommunityPack(vault, { owner: "o", repo: "r" });
    vault.approveAll({ pack: "o/r" });
    assert.equal(vault.listProposals().length, 0);

    stubFetch(buildTarGz(fixtureEntries("1.0.0")));
    const result = await updateCommunityPack(vault, "o/r@HEAD");
    assert.equal(result.upToDate, true);
    assert.deepEqual(result.proposed_new, []);
    assert.deepEqual(result.proposed_changed, []);
    assert.deepEqual(result.unchanged, ["thing"]);
    assert.equal(vault.listProposals().length, 0);
  });

  test("proposes changed notes when the version increases", async () => {
    const vault = tempVault();
    stubFetch(buildTarGz(fixtureEntries("1.0.0")));
    await addCommunityPack(vault, { owner: "o", repo: "r" });
    vault.approveAll({ pack: "o/r" });

    stubFetch(buildTarGz(fixtureEntries("1.1.0")));
    const result = await updateCommunityPack(vault, "o/r");
    assert.equal(result.upToDate, false);
    assert.deepEqual(result.proposed_changed, ["thing"]);
    const proposal = vault.listProposals()[0];
    assert.equal(proposal?.meta.proposed_by, "pack:o/r@1.1.0");
    assert.match(proposal?.meta.reason ?? "", /1\.0\.0 → 1\.1\.0/);
  });
});

describe("removeCommunityPack", () => {
  test("removes the cache only and leaves approved notes", async () => {
    const vault = tempVault();
    stubFetch(buildTarGz(fixtureEntries("1.0.0")));
    await addCommunityPack(vault, { owner: "o", repo: "r" });
    vault.approveAll({ pack: "o/r" });
    assert.ok(fs.existsSync(communityPackDir(vault, "o/r")));
    assert.equal(removeCommunityPack(vault, "o/r"), true);
    assert.ok(!fs.existsSync(communityPackDir(vault, "o/r")));
    assert.ok(vault.get("thing"), "installed note stays after removing the cache");
    assert.deepEqual(installedPacks(vault), { "o/r": "1.0.0" });
  });
});

describe("community pack input hardening", () => {
  test("rejects refs and --path with traversal before any fetch", async () => {
    const vault = tempVault();
    let fetched = 0;
    globalThis.fetch = (() => {
      fetched += 1;
      return Promise.reject(new Error("no network"));
    }) as typeof fetch;
    await assert.rejects(addCommunityPack(vault, { owner: "o", repo: "r", ref: "../../x" }), /invalid ref/);
    await assert.rejects(addCommunityPack(vault, { owner: "o", repo: "r", path: "../up" }), /invalid --path/);
    assert.equal(fetched, 0);
  });

  test("note files with unsafe names are reported, not written", async () => {
    const vault = tempVault();
    const entries = [
      ...fixtureEntries(),
      {
        path: "my-pack/notes/en/tech/evil:stream.md",
        data: "---\ntype: tech\nkind: library\ntitle: Evil\nlayer: backend\ntags: []\n---\n# Evil\n",
      },
    ];
    stubFetch(buildTarGz(entries));
    const result = await addCommunityPack(vault, { owner: "o", repo: "safe-names" });
    assert.ok(result.invalid.some((item) => item.file.endsWith("evil:stream.md")));
    assert.ok(!result.proposed_new.includes("evil-stream"));
  });

  test("proposals carry the pack as source, whatever the frontmatter says", async () => {
    const vault = tempVault();
    const entries = fixtureEntries().map((entry) =>
      typeof entry.data === "string" && entry.path.endsWith("en/tech/thing.md")
        ? { ...entry, data: entry.data.replace("tags: [thing]", "tags: [thing]\nsource: pack:web-typescript@9.9.9") }
        : entry,
    );
    stubFetch(buildTarGz(entries));
    await addCommunityPack(vault, { owner: "o", repo: "spoof" });
    assert.equal(vault.listProposals()[0]?.data.source, "pack:o/spoof@1.0.0");
  });

  test("update reuses the stored --path", async () => {
    const vault = tempVault();
    const nested = (version: string) =>
      fixtureEntries(version).map((entry) => ({ ...entry, path: entry.path.replace(/^my-pack/, "my-pack/packs/one") }));
    stubFetch(buildTarGz([{ path: "my-pack", type: "dir" }, ...nested("1.0.0")]));
    await addCommunityPack(vault, { owner: "o", repo: "nested", path: "packs/one" });
    stubFetch(buildTarGz([{ path: "my-pack", type: "dir" }, ...nested("1.1.0")]));
    const result = await updateCommunityPack(vault, "o/nested");
    assert.equal(result.version, "1.1.0");
  });
});
