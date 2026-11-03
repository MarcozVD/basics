import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { type Vault, VaultCache, VaultNotFoundError, vaultSignature } from "../src/index.js";

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");

function tempVault(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-vault-cache-"));
  fs.cpSync(SEED, dir, { recursive: true });
  return dir;
}

function writeNote(root: string, folder: string, id: string, frontmatter: string, body = `# ${id}`): string {
  fs.mkdirSync(path.join(root, folder), { recursive: true });
  const file = path.join(root, folder, `${id}.md`);
  fs.writeFileSync(file, `---\n${frontmatter}\n---\n\n${body}\n`);
  return file;
}

/** mtime has second-level granularity on some filesystems: make an edit visibly newer. */
function touchFuture(file: string): void {
  const at = new Date(Date.now() + 2000);
  fs.utimesSync(file, at, at);
}

test("vaultSignature tracks file count, size and newest mtime, ignoring the inbox", () => {
  const root = tempVault();
  const before = vaultSignature(root);
  assert.ok(before.files > 0);
  assert.ok(before.bytes > 0);
  assert.ok(before.newestMtimeMs > 0);

  const file = writeNote(root, "tech", "extra-tech", "type: tech\nkind: library\ntitle: Extra\nlayer: backend");
  touchFuture(file);
  const after = vaultSignature(root);
  assert.equal(after.files, before.files + 1);
  assert.ok(after.bytes > before.bytes);
  assert.ok(after.newestMtimeMs > before.newestMtimeMs);

  // A rename keeps the file's size and mtime, so only the path hash can notice it.
  fs.renameSync(file, file.replace("extra-tech.md", "renamed-tech.md"));
  const renamed = vaultSignature(root);
  assert.equal(renamed.files, after.files);
  assert.notEqual(renamed.pathsHash, after.pathsHash);

  // Proposals live in the inbox and are read from disk on every call, so they are not part of it.
  writeNote(root, "inbox", "pending-thing", "type: tech\nkind: library\ntitle: Pending\nlayer: backend", "proposal");
  assert.deepEqual(vaultSignature(root), renamed);
});

test("a cache reuses one vault across calls and rebuilds it after invalidate()", () => {
  const root = tempVault();
  const cache = new VaultCache(root, { verify: false });
  const first = cache.get();
  assert.equal(cache.get(), first, "no reload while nothing invalidated it");
  assert.equal(cache.version, 1);

  cache.invalidate();
  const second = cache.get();
  assert.notEqual(second, first, "invalidated: reloaded from disk");
  assert.equal(cache.version, 2);
  assert.deepEqual([...second.notes.keys()].sort(), [...first.notes.keys()].sort());
});

test("verify notices an external edit, a new note, a delete and a rename", () => {
  const root = tempVault();
  const cache = new VaultCache(root);

  const fastapi = path.join(root, "tech", "fastapi.md");
  const original = cache.get().get("fastapi");
  assert.ok(original);
  const version = cache.version;

  // 1. External edit of an existing note.
  fs.writeFileSync(fastapi, fs.readFileSync(fastapi, "utf8").replace("# FastAPI", "# FastAPI edited"));
  touchFuture(fastapi);
  assert.match(cache.get().get("fastapi")?.body ?? "", /FastAPI edited/);
  assert.ok(cache.version > version, "rebuilt on the edit");

  // 2. New note on disk.
  const created = cache.version;
  writeNote(root, "tech", "temporal", "type: tech\nkind: library\ntitle: Temporal\nlayer: backend");
  assert.ok(cache.get().get("temporal"));
  assert.ok(cache.version > created, "rebuilt on the new note");

  // 3. Delete.
  const beforeDelete = cache.version;
  fs.rmSync(path.join(root, "tech", "temporal.md"));
  assert.equal(cache.get().get("temporal"), undefined);
  assert.ok(cache.version > beforeDelete, "rebuilt on the delete");

  // 4. Rename: the old id is gone, the new one is there.
  const beforeRename = cache.version;
  fs.renameSync(path.join(root, "tech", "fastapi.md"), path.join(root, "tech", "fastapi-renamed.md"));
  const renamed = cache.get();
  assert.equal(renamed.get("fastapi"), undefined);
  assert.ok(renamed.get("fastapi-renamed"));
  assert.ok(cache.version > beforeRename, "rebuilt on the rename");
});

test("verify keeps checking after requests that found nothing new", () => {
  const root = tempVault();
  const cache = new VaultCache(root);
  const first = cache.get();
  // Two calls in a row compare equal: the check must not switch itself off afterwards.
  assert.equal(cache.get(), first);
  assert.equal(cache.get(), first);

  const file = path.join(root, "tech", "fastapi.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("# FastAPI", "# FastAPI again"));
  touchFuture(file);
  assert.match(cache.get().get("fastapi")?.body ?? "", /FastAPI again/);
});

test("a note with broken frontmatter drops out of the vault while the rest stays readable", () => {
  const root = tempVault();
  const cache = new VaultCache(root);
  const notesBefore = cache.get().notes.size;

  const broken = path.join(root, "tech", "broken.md");
  fs.writeFileSync(broken, "---\ntype: not-a-real-type\ntitle: Broken\n---\n\n# Broken\n");
  touchFuture(broken);

  const vault = cache.get();
  assert.equal(vault.get("broken"), undefined);
  assert.equal(vault.notes.size, notesBefore);
  assert.ok(
    vault.issues.some((issue) => issue.path === broken),
    "the parse error is reported",
  );

  // Fixing the file brings it back on the next call.
  fs.writeFileSync(broken, "---\ntype: tech\nkind: library\ntitle: Fixed\nlayer: backend\n---\n\n# Fixed\n");
  touchFuture(broken);
  assert.ok(cache.get().get("broken"));
});

test("a failed reload keeps the last good vault, a missing root still throws", () => {
  const root = tempVault();
  const cache = new VaultCache(root, { verify: false });
  const good = cache.get();
  assert.ok(good.notes.size > 0);

  // Make one folder unreadable for the duration of the reload: `Vault.load` cannot build a vault,
  // so the cache must keep serving the previous one instead of blanking the app.
  const techDir = path.join(root, "tech");
  const realReaddir = fs.readdirSync;
  const patched = fs as unknown as { readdirSync: typeof fs.readdirSync };
  patched.readdirSync = ((dir: fs.PathLike, opts?: unknown) => {
    if (String(dir) === techDir) throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    return (realReaddir as (d: fs.PathLike, o?: unknown) => unknown)(dir, opts);
  }) as typeof fs.readdirSync;
  try {
    cache.invalidate();
    assert.equal(cache.get(), good, "the last good vault is still served");
  } finally {
    patched.readdirSync = realReaddir;
  }

  // The next call retries the load, so recovering the folder is enough to pick the vault back up.
  const recovered = cache.get();
  assert.ok(recovered.notes.size >= good.notes.size);

  // A root that is really gone is reported as before, not hidden behind the old vault.
  cache.clear();
  fs.rmSync(root, { recursive: true, force: true });
  assert.throws(() => cache.get(), VaultNotFoundError);
});

test("ensureFresh is the async check: it reloads on a change and stays put otherwise", async () => {
  const root = tempVault();
  const cache = new VaultCache(root);
  await cache.ensureFresh();
  const version = cache.version;
  await cache.ensureFresh();
  assert.equal(cache.version, version, "nothing changed on disk");

  const file = path.join(root, "tech", "fastapi.md");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("# FastAPI", "# FastAPI async"));
  touchFuture(file);
  await cache.ensureFresh();
  assert.ok(cache.version > version);
  assert.match(cache.get().get("fastapi")?.body ?? "", /FastAPI async/);
});

test("memo keeps a derived value per vault generation and drops it on the next one", () => {
  const root = tempVault();
  const cache = new VaultCache(root);
  let builds = 0;
  const build = (vault: Vault) => {
    builds += 1;
    return vault.notes.size;
  };
  const first = cache.memo("count", build);
  assert.equal(cache.memo("count", build), first);
  assert.equal(builds, 1);

  cache.invalidate();
  assert.equal(cache.memo("count", build), first);
  assert.equal(builds, 2, "rebuilt for the new generation");

  // Different keys are independent.
  cache.memo("other", build);
  assert.equal(builds, 3);
});

test("memo drops the oldest entries past its limit", () => {
  const root = tempVault();
  const cache = new VaultCache(root, { memoLimit: 2, verify: false });
  cache.memo("a", () => 1);
  cache.memo("b", () => 2);
  cache.memo("c", () => 3);
  let rebuilt = false;
  cache.memo("a", () => {
    rebuilt = true;
    return 1;
  });
  assert.ok(rebuilt, "the oldest entry was evicted");
});
