import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const batch = (app, operations) =>
  app.request("/batch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ operations }) });
const create = (id, value) => ({ op: "create", id, value });
const update = (id, value, rev) => ({ op: "update", id, value, rev });
const remove = (id, rev) => ({ op: "delete", id, rev });
const state = async (app) => (await (await app.request("/records")).json()).items;
const ok = async (app, operations) => {
  const response = await batch(app, operations);
  assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
  return (await response.json()).results;
};
await runCases("http", [
  [
    "create, update and delete in one batch",
    async ({ http }) => {
      const app = await http();
      assert.deepEqual(await ok(app, [create("a", "one"), create("b", "two")]), [
        { id: "a", rev: 1 },
        { id: "b", rev: 1 },
      ]);
      assert.deepEqual(await ok(app, [update("a", "uno", 1), remove("b", 1)]), [
        { id: "a", rev: 2 },
        { id: "b", rev: null },
      ]);
      assert.deepEqual(await (await app.request("/records/a")).json(), { id: "a", value: "uno", rev: 2 });
      assert.equal((await app.request("/records/b")).status, 404);
      assert.equal((await app.request("/records/none")).status, 404);
    },
  ],
  [
    "operations see the effects of earlier operations",
    async ({ http }) => {
      const app = await http();
      assert.deepEqual(await ok(app, [create("a", "1"), update("a", "2", 1), update("a", "3", 2), remove("a", 3), create("a", "again")]), [
        { id: "a", rev: 1 },
        { id: "a", rev: 2 },
        { id: "a", rev: 3 },
        { id: "a", rev: null },
        { id: "a", rev: 1 },
      ]);
      assert.deepEqual(await state(app), [{ id: "a", value: "again", rev: 1 }]);
    },
  ],
  [
    "a failing middle operation rolls everything back",
    async ({ http }) => {
      const app = await http();
      await ok(app, [create("keep", "k"), create("x", "x")]);
      const before = await state(app);
      const response = await batch(app, [update("keep", "changed", 1), create("new", "n"), update("x", "bad", 99), remove("keep", 2)]);
      assert.equal(response.status, 409);
      const body = await response.json();
      assert.equal(body.index, 2);
      assert.equal(typeof body.error, "string");
      assert.deepEqual(await state(app), before);
      assert.equal((await app.request("/records/new")).status, 404);
    },
  ],
  [
    "conflicts: duplicate create, missing record, stale revision",
    async ({ http }) => {
      const app = await http();
      await ok(app, [create("a", "1")]);
      for (const [operations, index] of [
        [[create("a", "again")], 0],
        [[create("b", "1"), create("b", "2")], 1],
        [[update("ghost", "x", 1)], 0],
        [[remove("ghost", 1)], 0],
        [[update("a", "x", 2)], 0],
        [[create("c", "1"), remove("a", 5)], 1],
        [[remove("a", 1), remove("a", 1)], 1],
        [[remove("a", 1), update("a", "x", 1)], 1],
      ]) {
        const response = await batch(app, operations);
        assert.equal(response.status, 409, JSON.stringify(operations));
        assert.equal((await response.json()).index, index, JSON.stringify(operations));
      }
      assert.deepEqual(await state(app), [{ id: "a", value: "1", rev: 1 }]);
    },
  ],
  [
    "revisions: stale update fails, current succeeds, deleted ids restart at rev 1",
    async ({ http }) => {
      const app = await http();
      await ok(app, [create("a", "1")]);
      await ok(app, [update("a", "2", 1)]);
      assert.equal((await batch(app, [update("a", "stale", 1)])).status, 409);
      assert.deepEqual(await ok(app, [update("a", "3", 2)]), [{ id: "a", rev: 3 }]);
      await ok(app, [remove("a", 3)]);
      assert.deepEqual(await ok(app, [create("a", "reborn")]), [{ id: "a", rev: 1 }]);
      assert.equal((await batch(app, [remove("a", 3)])).status, 409);
    },
  ],
  [
    "malformed batches are rejected before any change",
    async ({ http }) => {
      const app = await http();
      await ok(app, [create("a", "1")]);
      const bad = [
        [create("b", "ok"), { op: "create", id: "c" }],
        [create("b", "ok"), { op: "update", id: "a", value: "x" }],
        [create("b", "ok"), { op: "delete", id: "a" }],
        [create("b", "ok"), { op: "rename", id: "a" }],
        [create("b", "ok"), create("bad id", "x")],
        [create("b", "ok"), create("c", "x".repeat(201))],
        [create("b", "ok"), { ...create("c", "x"), extra: 1 }],
        [create("b", "ok"), update("a", "x", 1.5)],
        [create("b", "ok"), null],
        [create("b", "ok"), "x"],
      ];
      for (const operations of bad) {
        const response = await batch(app, operations);
        assert.equal(response.status, 400, JSON.stringify(operations));
        assert.equal((await response.json()).index, 1);
      }
      assert.deepEqual(await state(app), [{ id: "a", value: "1", rev: 1 }]);
    },
  ],
  [
    "invalid envelopes",
    async ({ http }) => {
      const app = await http();
      for (const body of [
        "{",
        "[]",
        "{}",
        '{"operations":[]}',
        '{"operations":"x"}',
        '{"operations":[{"op":"create","id":"a","value":"1"}],"extra":1}',
        JSON.stringify({ operations: Array.from({ length: 51 }, (_, i) => create(`r${i}`, "v")) }),
      ])
        assert.equal((await app.request("/batch", { method: "POST", body })).status, 400, body.slice(0, 60));
      assert.deepEqual(await state(app), []);
      const fifty = await ok(
        app,
        Array.from({ length: 50 }, (_, i) => create(`r${i}`, "v")),
      );
      assert.equal(fifty.length, 50);
      assert.equal((await state(app)).length, 50);
    },
  ],
  [
    "records are listed by id in code-unit order",
    async ({ http }) => {
      const app = await http();
      await ok(app, [create("b", "1"), create("B", "2"), create("10", "3"), create("a", "4"), create("9", "5")]);
      assert.deepEqual(
        (await state(app)).map((record) => record.id),
        ["10", "9", "B", "a", "b"],
      );
      assert.deepEqual(await (await app.request("/records")).json(), { items: await state(app) });
    },
  ],
  [
    "repeated deletes",
    async ({ http }) => {
      const app = await http();
      await ok(app, [create("a", "1")]);
      await ok(app, [remove("a", 1)]);
      const response = await batch(app, [remove("a", 1)]);
      assert.equal(response.status, 409);
      assert.equal((await response.json()).index, 0);
      assert.deepEqual(await state(app), []);
    },
  ],
]);
