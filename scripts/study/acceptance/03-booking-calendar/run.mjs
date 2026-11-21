import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const post = (app, resource, body) =>
  app.request(`/resources/${resource}/bookings`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
const book = (app, resource, start, end) => post(app, resource, { start, end });
const list = async (app, resource) => (await (await app.request(`/resources/${resource}/bookings`)).json()).items;
await runCases("http", [
  [
    "create returns a normalized UTC booking",
    async ({ http }) => {
      const app = await http();
      const response = await book(app, "room-1", "2026-03-01T12:00:00+02:00", "2026-03-01T12:30:00.5Z");
      assert.equal(response.status, 201);
      const body = await response.json();
      assert.equal(typeof body.id, "string");
      assert.ok(body.id);
      assert.deepEqual(
        { ...body, id: "x" },
        { id: "x", resource: "room-1", start: "2026-03-01T10:00:00.000Z", end: "2026-03-01T12:30:00.500Z" },
      );
    },
  ],
  [
    "adjacent bookings are allowed",
    async ({ http }) => {
      const app = await http();
      assert.equal((await book(app, "r", "2026-03-01T10:00:00Z", "2026-03-01T11:00:00Z")).status, 201);
      assert.equal((await book(app, "r", "2026-03-01T11:00:00Z", "2026-03-01T12:00:00Z")).status, 201);
      assert.equal((await book(app, "r", "2026-03-01T09:00:00Z", "2026-03-01T10:00:00Z")).status, 201);
      assert.equal((await list(app, "r")).length, 3);
    },
  ],
  [
    "overlaps are rejected without changing state",
    async ({ http }) => {
      const app = await http();
      assert.equal((await book(app, "r", "2026-03-01T10:00:00Z", "2026-03-01T12:00:00Z")).status, 201);
      for (const [start, end] of [
        ["2026-03-01T10:00:00Z", "2026-03-01T12:00:00Z"],
        ["2026-03-01T09:00:00Z", "2026-03-01T10:00:00.001Z"],
        ["2026-03-01T11:59:59.999Z", "2026-03-01T13:00:00Z"],
        ["2026-03-01T10:30:00Z", "2026-03-01T11:00:00Z"],
        ["2026-03-01T09:00:00Z", "2026-03-01T13:00:00Z"],
        ["2026-03-01T13:30:00+02:00", "2026-03-01T14:00:00+02:00"],
      ])
        assert.equal((await book(app, "r", start, end)).status, 409, `${start} ${end}`);
      assert.equal((await list(app, "r")).length, 1);
    },
  ],
  [
    "different offsets are compared as instants",
    async ({ http }) => {
      const app = await http();
      assert.equal((await book(app, "r", "2026-03-01T10:00:00+02:00", "2026-03-01T11:00:00+02:00")).status, 201);
      assert.equal((await book(app, "r", "2026-03-01T08:30:00Z", "2026-03-01T09:30:00Z")).status, 409);
      assert.equal((await book(app, "r", "2026-03-01T07:00:00Z", "2026-03-01T08:00:00Z")).status, 201);
    },
  ],
  [
    "resources are independent",
    async ({ http }) => {
      const app = await http();
      assert.equal((await book(app, "a", "2026-03-01T10:00:00Z", "2026-03-01T11:00:00Z")).status, 201);
      assert.equal((await book(app, "b", "2026-03-01T10:00:00Z", "2026-03-01T11:00:00Z")).status, 201);
      assert.equal((await list(app, "a")).length, 1);
      assert.deepEqual(await list(app, "unused"), []);
    },
  ],
  [
    "cancelling frees the interval",
    async ({ http }) => {
      const app = await http();
      const { id } = await (await book(app, "r", "2026-03-01T10:00:00Z", "2026-03-01T11:00:00Z")).json();
      assert.equal((await book(app, "r", "2026-03-01T10:30:00Z", "2026-03-01T11:30:00Z")).status, 409);
      const deleted = await app.request(`/bookings/${id}`, { method: "DELETE" });
      assert.equal(deleted.status, 204);
      assert.equal(await deleted.text(), "");
      assert.equal((await book(app, "r", "2026-03-01T10:30:00Z", "2026-03-01T11:30:00Z")).status, 201);
      assert.equal((await app.request(`/bookings/${id}`, { method: "DELETE" })).status, 404);
      assert.equal((await app.request("/bookings/missing", { method: "DELETE" })).status, 404);
    },
  ],
  [
    "listing is ordered by start instant then creation",
    async ({ http }) => {
      const app = await http();
      await book(app, "r", "2026-03-01T15:00:00Z", "2026-03-01T16:00:00Z");
      await book(app, "r", "2026-03-01T10:00:00Z", "2026-03-01T10:20:00Z");
      await book(app, "r", "2026-03-01T12:30:00+02:00", "2026-03-01T12:45:00+02:00");
      await book(app, "r", "2026-03-01T07:00:00-05:00", "2026-03-01T07:10:00-05:00");
      const items = await list(app, "r");
      assert.deepEqual(
        items.map((item) => item.start),
        ["2026-03-01T10:00:00.000Z", "2026-03-01T10:30:00.000Z", "2026-03-01T12:00:00.000Z", "2026-03-01T15:00:00.000Z"],
      );
    },
  ],
  [
    "invalid requests",
    async ({ http }) => {
      const app = await http();
      const bodies = [
        { start: "2026-03-01T10:00:00", end: "2026-03-01T11:00:00" },
        { start: "2026-03-01T10:00:00Z", end: "2026-03-01T10:00:00Z" },
        { start: "2026-03-01T11:00:00Z", end: "2026-03-01T10:00:00Z" },
        { start: "later", end: "2026-03-01T10:00:00Z" },
        { start: "2026-03-01T10:00:00Z" },
        { start: 1, end: 2 },
        { start: "2026-03-01T10:00:00Z", end: "2026-03-01T11:00:00Z", extra: 1 },
        [],
        "{",
      ];
      for (const body of bodies) assert.equal((await post(app, "r", body)).status, 400, JSON.stringify(body));
      assert.equal((await book(app, "Bad_Name", "2026-03-01T10:00:00Z", "2026-03-01T11:00:00Z")).status, 400);
      assert.deepEqual(await list(app, "r"), []);
    },
  ],
  [
    "concurrent competing bookings create exactly one",
    async ({ http }) => {
      const app = await http();
      const responses = await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          book(app, "r", `2026-03-01T10:${String(i).padStart(2, "0")}:00Z`, `2026-03-01T11:${String(i).padStart(2, "0")}:00Z`),
        ),
      );
      const codes = responses.map((response) => response.status);
      assert.equal(codes.filter((code) => code === 201).length, 1);
      assert.equal(codes.filter((code) => code === 409).length, 11);
      assert.equal((await list(app, "r")).length, 1);
    },
  ],
]);
