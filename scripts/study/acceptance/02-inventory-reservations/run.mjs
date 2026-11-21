import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const json = (app, url, method, body, headers = {}) =>
  app.request(url, {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
const stock = async (app, sku, count) => {
  const response = await json(app, `/items/${sku}`, "PUT", { stock: count });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { sku, available: count });
};
const reserve = (app, sku, quantity, key) => json(app, `/items/${sku}/reserve`, "POST", { quantity }, { "idempotency-key": key });
const available = async (app, sku) => (await (await app.request(`/items/${sku}`)).json()).available;
await runCases("http", [
  [
    "create, read and duplicate items",
    async ({ http }) => {
      const app = await http();
      await stock(app, "widget", 5);
      assert.deepEqual(await (await app.request("/items/widget")).json(), { sku: "widget", available: 5 });
      assert.equal((await json(app, "/items/widget", "PUT", { stock: 9 })).status, 409);
      assert.equal(await available(app, "widget"), 5);
      assert.equal((await app.request("/items/none")).status, 404);
      for (const [sku, body] of [
        ["ok", { stock: -1 }],
        ["ok", { stock: 1.5 }],
        ["ok", { stock: "3" }],
        ["ok", { stock: 1000000001 }],
        ["ok", {}],
        ["ok", { stock: 1, extra: 1 }],
        ["ok", "{"],
        ["ok", []],
        ["bad sku", { stock: 1 }],
        ["x".repeat(41), { stock: 1 }],
      ])
        assert.equal((await json(app, `/items/${encodeURIComponent(sku)}`, "PUT", body)).status, 400, JSON.stringify([sku, body]));
      assert.equal((await app.request("/items/ok")).status, 404);
    },
  ],
  [
    "reserve reduces stock and returns a reservation",
    async ({ http }) => {
      const app = await http();
      await stock(app, "a", 10);
      const response = await reserve(app, "a", 4, "k1");
      assert.equal(response.status, 201);
      const body = await response.json();
      assert.equal(typeof body.reservation_id, "string");
      assert.ok(body.reservation_id);
      assert.deepEqual({ ...body, reservation_id: "x" }, { reservation_id: "x", sku: "a", quantity: 4, status: "active" });
      assert.equal(await available(app, "a"), 6);
      const second = await (await reserve(app, "a", 1, "k2")).json();
      assert.notEqual(second.reservation_id, body.reservation_id);
    },
  ],
  [
    "insufficient stock returns 409, records nothing and allows the key later",
    async ({ http }) => {
      const app = await http();
      await stock(app, "a", 3);
      assert.equal((await reserve(app, "a", 4, "k")).status, 409);
      assert.equal(await available(app, "a"), 3);
      assert.equal((await reserve(app, "a", 3, "k")).status, 201);
      assert.equal(await available(app, "a"), 0);
      assert.equal((await reserve(app, "a", 1, "other")).status, 409);
      assert.equal(await available(app, "a"), 0);
    },
  ],
  [
    "idempotent replay returns the original body and changes nothing",
    async ({ http }) => {
      const app = await http();
      await stock(app, "a", 10);
      const first = await reserve(app, "a", 3, "same");
      const firstBody = await first.json();
      for (let i = 0; i < 3; i++) {
        const replay = await reserve(app, "a", 3, "same");
        assert.equal(replay.status, 201);
        assert.deepEqual(await replay.json(), firstBody);
      }
      assert.equal(await available(app, "a"), 7);
      const released = await app.request(`/reservations/${firstBody.reservation_id}/release`, { method: "POST" });
      assert.equal(released.status, 200);
      const replayAfter = await reserve(app, "a", 3, "same");
      assert.equal(replayAfter.status, 201);
      assert.deepEqual(await replayAfter.json(), firstBody);
      assert.equal(await available(app, "a"), 10);
    },
  ],
  [
    "a key reused with a different quantity or sku returns 422",
    async ({ http }) => {
      const app = await http();
      await stock(app, "a", 10);
      await stock(app, "b", 10);
      assert.equal((await reserve(app, "a", 2, "k")).status, 201);
      assert.equal((await reserve(app, "a", 3, "k")).status, 422);
      assert.equal((await reserve(app, "b", 2, "k")).status, 422);
      assert.equal(await available(app, "a"), 8);
      assert.equal(await available(app, "b"), 10);
    },
  ],
  [
    "release returns stock once and replays",
    async ({ http }) => {
      const app = await http();
      await stock(app, "a", 5);
      const { reservation_id } = await (await reserve(app, "a", 5, "k")).json();
      assert.equal(await available(app, "a"), 0);
      for (let i = 0; i < 3; i++) {
        const response = await app.request(`/reservations/${reservation_id}/release`, { method: "POST" });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { reservation_id, sku: "a", quantity: 5, status: "released" });
        assert.equal(await available(app, "a"), 5);
      }
      assert.equal((await app.request("/reservations/missing/release", { method: "POST" })).status, 404);
      assert.equal((await reserve(app, "a", 5, "again")).status, 201);
    },
  ],
  [
    "validation order and errors",
    async ({ http }) => {
      const app = await http();
      await stock(app, "a", 5);
      assert.equal((await json(app, "/items/a/reserve", "POST", { quantity: 1 })).status, 400);
      assert.equal((await json(app, "/items/a/reserve", "POST", { quantity: 1 }, { "idempotency-key": "x".repeat(65) })).status, 400);
      for (const body of [
        { quantity: 0 },
        { quantity: 1001 },
        { quantity: 1.5 },
        { quantity: "1" },
        {},
        { quantity: 1, extra: 1 },
        "{",
        [],
      ])
        assert.equal((await json(app, "/items/a/reserve", "POST", body, { "idempotency-key": "k" })).status, 400, JSON.stringify(body));
      assert.equal((await reserve(app, "ghost", 1, "k")).status, 404);
      assert.equal((await reserve(app, "ghost", 0, "k")).status, 400);
      assert.equal(await available(app, "a"), 5);
      assert.equal((await reserve(app, "a", 1, "x".repeat(64))).status, 201);
    },
  ],
  [
    "concurrent reservations never oversell",
    async ({ http }) => {
      const app = await http();
      await stock(app, "a", 5);
      const responses = await Promise.all(Array.from({ length: 24 }, (_, i) => reserve(app, "a", 1, `k${i}`)));
      const codes = responses.map((response) => response.status);
      assert.equal(codes.filter((code) => code === 201).length, 5);
      assert.equal(codes.filter((code) => code === 409).length, 19);
      const ids = new Set();
      for (const response of responses) if (response.status === 201) ids.add((await response.json()).reservation_id);
      assert.equal(ids.size, 5);
      assert.equal(await available(app, "a"), 0);
    },
  ],
  [
    "concurrent replays of one key reserve once",
    async ({ http }) => {
      const app = await http();
      await stock(app, "a", 10);
      const responses = await Promise.all(Array.from({ length: 12 }, () => reserve(app, "a", 4, "same-key")));
      const bodies = await Promise.all(responses.map((response) => response.json()));
      assert.ok(responses.every((response) => response.status === 201));
      assert.equal(new Set(bodies.map((body) => body.reservation_id)).size, 1);
      assert.equal(await available(app, "a"), 6);
    },
  ],
]);
