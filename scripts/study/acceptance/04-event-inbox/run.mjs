import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const post = (app, body) =>
  app.request("/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const event = (id, at = 0, type = "t", payload = {}) => ({ id, type, at, payload });
const items = async (app, query = "") => (await (await app.request(`/events${query}`)).json()).items;
await runCases("http", [
  [
    "create and read an event",
    async ({ http }) => {
      const app = await http();
      const body = event("e1", 5, "click", { x: 1, nested: { y: [1, 2] } });
      const response = await post(app, body);
      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), body);
      assert.deepEqual(await (await app.request("/events/e1")).json(), body);
      assert.equal((await app.request("/events/missing")).status, 404);
    },
  ],
  [
    "identical redelivery returns 200 without duplicating",
    async ({ http }) => {
      const app = await http();
      assert.equal((await post(app, event("e1", 1, "t", { a: 1, b: { c: 2, d: 3 } }))).status, 201);
      const again = await post(app, '{"payload":{"b":{"d":3,"c":2},"a":1},"type":"t","at":1,"id":"e1"}');
      assert.equal(again.status, 200);
      assert.deepEqual(await again.json(), event("e1", 1, "t", { a: 1, b: { c: 2, d: 3 } }));
      assert.equal((await items(app)).length, 1);
    },
  ],
  [
    "conflicting redelivery returns 409 and keeps the original",
    async ({ http }) => {
      const app = await http();
      await post(app, event("e1", 1, "t", { a: 1 }));
      for (const changed of [
        event("e1", 2, "t", { a: 1 }),
        event("e1", 1, "u", { a: 1 }),
        event("e1", 1, "t", { a: 2 }),
        event("e1", 1, "t", { a: 1, b: 1 }),
        event("e1", 1, "t", { a: [1] }),
      ])
        assert.equal((await post(app, changed)).status, 409, JSON.stringify(changed));
      assert.deepEqual(await items(app), [event("e1", 1, "t", { a: 1 })]);
    },
  ],
  [
    "listing order is independent of arrival order",
    async ({ http }) => {
      const app = await http();
      for (const [id, at] of [
        ["c", 5],
        ["b", 5],
        ["a", 7],
        ["B", 5],
        ["z", 1],
        ["10", 5],
        ["9", 5],
      ])
        await post(app, event(id, at));
      assert.deepEqual(
        (await items(app)).map((entry) => `${entry.at}:${entry.id}`),
        ["1:z", "5:10", "5:9", "5:B", "5:b", "5:c", "7:a"],
      );
      const other = await http();
      for (const [id, at] of [
        ["a", 7],
        ["9", 5],
        ["z", 1],
        ["c", 5],
        ["10", 5],
        ["b", 5],
        ["B", 5],
      ])
        await post(other, event(id, at));
      assert.deepEqual(await items(other), await items(app));
    },
  ],
  [
    "type filter and totals",
    async ({ http }) => {
      const app = await http();
      await post(app, event("a", 2, "x"));
      await post(app, event("b", 1, "y"));
      await post(app, event("c", 3, "x"));
      const response = await app.request("/events?type=x");
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { items: [event("a", 2, "x"), event("c", 3, "x")], total: 2 });
      assert.deepEqual(await (await app.request("/events?type=none")).json(), { items: [], total: 0 });
      assert.equal((await app.request("/events?limit=1")).status, 400);
      assert.equal((await app.request("/events?type=x&bogus=1")).status, 400);
    },
  ],
  [
    "invalid input changes nothing",
    async ({ http }) => {
      const app = await http();
      const bad = [
        event("", 0),
        event("has space", 0),
        event("x".repeat(65), 0),
        event("a", -1),
        event("a", 1.5),
        event("a", "1"),
        { ...event("a"), type: "" },
        { ...event("a"), type: "t".repeat(41) },
        { ...event("a"), payload: [] },
        { ...event("a"), payload: null },
        { ...event("a"), payload: "x" },
        { ...event("a"), extra: 1 },
        { id: "a", type: "t", at: 0 },
        [],
        "{",
        "null",
      ];
      for (const body of bad) assert.equal((await post(app, body)).status, 400, JSON.stringify(body));
      assert.deepEqual(await items(app), []);
      assert.equal((await post(app, event("a".repeat(64), 0, "t".repeat(40)))).status, 201);
    },
  ],
  [
    "empty inbox",
    async ({ http }) => {
      const app = await http();
      assert.deepEqual(await (await app.request("/events")).json(), { items: [], total: 0 });
    },
  ],
]);
