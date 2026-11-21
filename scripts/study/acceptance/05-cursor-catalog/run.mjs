import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const add = async (app, name, price) => {
  const response = await app.request("/items", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, price }),
  });
  assert.equal(response.status, 201);
  return response.json();
};
const page = async (app, query) => {
  const response = await app.request(`/items?${query}`);
  assert.equal(response.status, 200, query);
  return response.json();
};
const walk = async (app, base) => {
  const ids = [],
    pages = [];
  let cursor = null;
  for (let guard = 0; guard < 100; guard++) {
    const body = await page(app, cursor ? `${base}&cursor=${encodeURIComponent(cursor)}` : base);
    pages.push(body.items.length);
    ids.push(...body.items.map((item) => item.id));
    if (body.next_cursor === null) return { ids, pages };
    assert.equal(typeof body.next_cursor, "string");
    cursor = body.next_cursor;
  }
  throw new Error("cursor traversal did not end");
};
const seed = async (app) => {
  // ids 1..9 with deliberate ties on both name and price
  const data = [
    ["pear", 5],
    ["apple", 3],
    ["fig", 3],
    ["Apple", 9],
    ["pear", 1],
    ["fig", 5],
    ["kiwi", 3],
    ["apple", 3],
    ["Zed", 5],
  ];
  for (const [name, price] of data) await add(app, name, price);
};
const expected = {
  "sort=name&dir=asc": [4, 9, 2, 8, 3, 6, 7, 1, 5],
  "sort=name&dir=desc": [1, 5, 7, 3, 6, 2, 8, 9, 4],
  "sort=price&dir=asc": [5, 2, 3, 7, 8, 1, 6, 9, 4],
  "sort=price&dir=desc": [4, 1, 6, 9, 2, 3, 7, 8, 5],
};
await runCases("http", [
  [
    "create items with sequential integer ids",
    async ({ http }) => {
      const app = await http();
      assert.deepEqual(await add(app, "a", 1), { id: 1, name: "a", price: 1 });
      assert.deepEqual(await add(app, "b", 0), { id: 2, name: "b", price: 0 });
      assert.deepEqual(await (await app.request("/items")).json(), {
        items: [
          { id: 1, name: "a", price: 1 },
          { id: 2, name: "b", price: 0 },
        ],
        next_cursor: null,
      });
    },
  ],
  [
    "default order is name ascending with ties by id",
    async ({ http }) => {
      const app = await http();
      await seed(app);
      assert.deepEqual(
        (await page(app, "limit=50")).items.map((item) => item.id),
        expected["sort=name&dir=asc"],
      );
      assert.deepEqual(
        (await page(app, "")).items.map((item) => item.id),
        expected["sort=name&dir=asc"],
      );
    },
  ],
  [
    "all four orderings, ties always by id ascending",
    async ({ http }) => {
      const app = await http();
      await seed(app);
      for (const [query, ids] of Object.entries(expected))
        assert.deepEqual(
          (await page(app, `${query}&limit=50`)).items.map((item) => item.id),
          ids,
          query,
        );
    },
  ],
  [
    "cursor traversal returns every item once in order",
    async ({ http }) => {
      const app = await http();
      await seed(app);
      for (const [query, ids] of Object.entries(expected))
        for (const limit of [1, 2, 4]) {
          const { ids: walked } = await walk(app, `${query}&limit=${limit}`);
          assert.deepEqual(walked, ids, `${query} limit ${limit}`);
        }
    },
  ],
  [
    "the last page has no cursor, including an exact multiple of the limit",
    async ({ http }) => {
      const app = await http();
      for (let i = 0; i < 6; i++) await add(app, `n${i}`, i);
      assert.deepEqual((await walk(app, "limit=3")).pages, [3, 3]);
      assert.deepEqual((await walk(app, "limit=4")).pages, [4, 2]);
      assert.deepEqual((await page(app, "limit=6")).next_cursor, null);
      assert.deepEqual((await page(app, "limit=50")).next_cursor, null);
      const empty = await http();
      assert.deepEqual(await (await empty.request("/items")).json(), { items: [], next_cursor: null });
    },
  ],
  [
    "keyset paging: inserts before the cursor never shift later pages",
    async ({ http }) => {
      const app = await http();
      for (const name of ["b", "d", "f", "h"]) await add(app, name, 1);
      const first = await page(app, "limit=2");
      assert.deepEqual(
        first.items.map((item) => item.name),
        ["b", "d"],
      );
      await add(app, "a", 1);
      await add(app, "c", 1);
      await add(app, "e", 1);
      const second = await page(app, `limit=2&cursor=${encodeURIComponent(first.next_cursor)}`);
      assert.deepEqual(
        second.items.map((item) => item.name),
        ["e", "f"],
      );
      const third = await page(app, `limit=2&cursor=${encodeURIComponent(second.next_cursor)}`);
      assert.deepEqual(
        third.items.map((item) => item.name),
        ["h"],
      );
      assert.equal(third.next_cursor, null);
    },
  ],
  [
    "cursors are bound to their sort and direction",
    async ({ http }) => {
      const app = await http();
      await seed(app);
      const { next_cursor } = await page(app, "sort=price&dir=asc&limit=2");
      for (const query of ["sort=name&dir=asc", "sort=price&dir=desc", "dir=asc"])
        assert.equal((await app.request(`/items?${query}&cursor=${encodeURIComponent(next_cursor)}`)).status, 400, query);
      assert.equal((await app.request(`/items?sort=price&dir=asc&cursor=${encodeURIComponent(next_cursor)}`)).status, 200);
    },
  ],
  [
    "malformed and forged cursors return 400",
    async ({ http }) => {
      const app = await http();
      await seed(app);
      const forged = [
        "garbage",
        "",
        Buffer.from("{}").toString("base64url"),
        Buffer.from("not json").toString("base64url"),
        Buffer.from(JSON.stringify({ sort: "name", dir: "asc", key: 5, id: 1 })).toString("base64url"),
        Buffer.from(JSON.stringify({ sort: "name", dir: "asc", key: "a", id: "x" })).toString("base64url"),
      ];
      for (const cursor of forged) assert.equal((await app.request(`/items?cursor=${encodeURIComponent(cursor)}`)).status, 400, cursor);
    },
  ],
  [
    "invalid parameters and items",
    async ({ http }) => {
      const app = await http();
      for (const query of ["limit=0", "limit=51", "limit=1.5", "limit=x", "limit=-1", "sort=id", "sort=", "dir=up", "extra=1", "filter=a"])
        assert.equal((await app.request(`/items?${query}`)).status, 400, query);
      for (const body of [
        { name: "", price: 1 },
        { name: "x".repeat(81), price: 1 },
        { name: "a", price: -1 },
        { name: "a", price: 1.5 },
        { name: "a", price: "1" },
        { name: "a" },
        { name: "a", price: 1, extra: 1 },
        [],
        "{",
      ])
        assert.equal(
          (await app.request("/items", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) })).status,
          400,
          JSON.stringify(body),
        );
      assert.deepEqual((await page(app, "")).items, []);
      assert.equal((await app.request("/items?limit=50")).status, 200);
      assert.equal((await app.request("/items?limit=1")).status, 200);
    },
  ],
]);
