import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type GraphData, Vault, VaultCache } from "@marcozvd/basics-core";
import { test } from "vitest";
import { createApp } from "../src/server/app.js";
import { EventHub } from "../src/server/events.js";

const SEED = path.resolve(import.meta.dirname, "../../../examples/vault");
const HOST = { host: "localhost:4747" };

function tempVault(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-cache-api-"));
  fs.cpSync(SEED, dir, { recursive: true });
  return dir;
}

interface NoteListEntry {
  id: string;
  title: string;
}

async function notes(app: ReturnType<typeof createApp>): Promise<NoteListEntry[]> {
  const res = await app.request("/api/notes", { headers: HOST });
  assert.equal(res.status, 200);
  return (await res.json()) as NoteListEntry[];
}

/** Wait until an external change reaches the app through the watcher (its flush is debounced). */
async function until(check: () => Promise<boolean>, what: string, timeoutMs = 8000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail(`timed out waiting for ${what}`);
}

test("one vault is loaded for many requests, not one per request", async () => {
  const root = tempVault();
  const cache = new VaultCache(root, { verify: false });
  const app = createApp({ root, cache });

  const first = (await (await app.request("/api/graph", { headers: HOST })).json()) as GraphData;
  const version = cache.version;
  const second = (await (await app.request("/api/graph", { headers: HOST })).json()) as GraphData;
  assert.deepEqual(second, first);
  assert.equal(cache.version, version, "the second request reused the cached vault");
});

test("an edit made outside the app shows up in the next request", async () => {
  const root = tempVault();
  const events = new EventHub(root);
  events.start();
  await events.ready();
  const app = createApp({ root, events });
  try {
    const before = await notes(app);
    assert.ok(before.some((note) => note.id === "fastapi" && note.title === "FastAPI"));

    const file = path.join(root, "tech", "fastapi.md");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("title: FastAPI", "title: FastAPI edited"));

    await until(
      async () => (await notes(app)).some((note) => note.id === "fastapi" && note.title === "FastAPI edited"),
      "the external edit",
    );
  } finally {
    await events.close();
  }
});

test("a note added, renamed and deleted outside the app all reach the next request", async () => {
  const root = tempVault();
  const events = new EventHub(root);
  events.start();
  await events.ready();
  const app = createApp({ root, events });
  try {
    // Added.
    fs.writeFileSync(
      path.join(root, "tech", "temporal.md"),
      "---\ntype: tech\nkind: library\ntitle: Temporal\nlayer: backend\n---\n\n# Temporal\n",
    );
    await until(async () => (await notes(app)).some((note) => note.id === "temporal"), "the new note");

    // Renamed: the id follows the file name.
    fs.renameSync(path.join(root, "tech", "temporal.md"), path.join(root, "tech", "temporal-renamed.md"));
    await until(async () => {
      const list = await notes(app);
      return list.some((note) => note.id === "temporal-renamed") && !list.some((note) => note.id === "temporal");
    }, "the rename");

    // Deleted.
    fs.rmSync(path.join(root, "tech", "temporal-renamed.md"));
    await until(async () => !(await notes(app)).some((note) => note.id === "temporal-renamed"), "the delete");
  } finally {
    await events.close();
  }
});

test("a write made by the server itself is visible in the next request", async () => {
  const root = tempVault();
  const cache = new VaultCache(root, { verify: false });
  const app = createApp({ root, cache });

  const list = await notes(app);
  const fastapi = list.find((note) => note.id === "fastapi");
  assert.ok(fastapi);

  const saved = await app.request("/api/notes/fastapi", {
    method: "PUT",
    headers: { ...HOST, "content-type": "application/json" },
    body: JSON.stringify({ data: { type: "tech", kind: "framework", title: "FastAPI v2", layer: "backend" }, body: "# FastAPI v2" }),
  });
  assert.equal(saved.status, 200);

  const after = await notes(app);
  assert.ok(
    after.some((note) => note.id === "fastapi" && note.title === "FastAPI v2"),
    "the cached vault was invalidated",
  );

  // Creating and deleting through the API too.
  const created = await app.request("/api/notes", {
    method: "POST",
    headers: { ...HOST, "content-type": "application/json" },
    body: JSON.stringify({ id: "hono", data: { type: "tech", kind: "framework", title: "Hono", layer: "backend" }, body: "# Hono" }),
  });
  assert.equal(created.status, 201);
  assert.ok((await notes(app)).some((note) => note.id === "hono"));

  const deleted = await app.request("/api/notes/hono", { method: "DELETE", headers: HOST });
  assert.equal(deleted.status, 204);
  assert.ok(!(await notes(app)).some((note) => note.id === "hono"));
});

test("a watcher change invalidates the cache before the debounced broadcast", async () => {
  const root = tempVault();
  const events = new EventHub(root);
  events.start();
  await events.ready();
  const app = createApp({ root, events });
  let broadcasts = 0;
  events.subscribe((event) => {
    if (event.type === "vault") broadcasts += 1;
  });
  try {
    assert.ok(!(await notes(app)).some((note) => note.id === "temporal"));
    // The request below must already see the new note: waiting for the broadcast would leave a
    // request that lands between the write and the flush with the old vault.
    const changed = new Promise<void>((resolve) => events.onChange(resolve));
    fs.writeFileSync(
      path.join(root, "tech", "temporal.md"),
      "---\ntype: tech\nkind: library\ntitle: Temporal\nlayer: backend\n---\n\n# Temporal\n",
    );
    await changed;
    assert.equal(broadcasts, 0, "the change is not broadcast yet");
    assert.ok(
      (await notes(app)).some((note) => note.id === "temporal"),
      "the cache reloaded on the change",
    );
  } finally {
    await events.close();
  }
});

test("a note with broken frontmatter drops out while the rest of the vault is served", async () => {
  const root = tempVault();
  const events = new EventHub(root);
  events.start();
  await events.ready();
  const app = createApp({ root, events });
  try {
    const before = await notes(app);
    fs.writeFileSync(path.join(root, "tech", "broken.md"), "---\ntype: nope\ntitle: Broken\n---\n\n# Broken\n");
    await until(async () => {
      const res = await app.request("/api/graph", { headers: HOST });
      return res.status === 200 && (await notes(app)).length === before.length;
    }, "the reload after the broken file");
    const list = await notes(app);
    assert.ok(!list.some((note) => note.id === "broken"));
    assert.equal(list.length, before.length, "the other notes are still there");

    // Fixing it brings the note back.
    fs.writeFileSync(
      path.join(root, "tech", "broken.md"),
      "---\ntype: tech\nkind: library\ntitle: Fixed\nlayer: backend\n---\n\n# Fixed\n",
    );
    await until(async () => (await notes(app)).some((note) => note.id === "broken" && note.title === "Fixed"), "the fixed note");
  } finally {
    await events.close();
  }
});

test("inbox proposals are read fresh: approving one updates the notes list", async () => {
  const root = tempVault();
  const cache = new VaultCache(root, { verify: false });
  const app = createApp({ root, cache });

  assert.ok(!(await notes(app)).some((note) => note.id === "redis"));
  // Proposals come from agents, packs or the CLI; write one directly, as those do.
  const writer = Vault.load(root);
  writer.propose("redis", { type: "tech", kind: "database", title: "Redis", layer: "backend" }, "# Redis", {
    proposed_by: "test",
    reason: "cache",
  });

  assert.ok(!(await notes(app)).some((note) => note.id === "redis"), "a proposal is not a note yet");

  const approved = await app.request("/api/inbox/redis/approve", {
    method: "POST",
    headers: { ...HOST, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(approved.status, 200);
  assert.ok(
    (await notes(app)).some((note) => note.id === "redis"),
    "the approved note is served without a manual reload",
  );
});
