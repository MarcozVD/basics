import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const send = (app, url, method, body) =>
  app.request(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const create = async (app, title, status) => {
  const response = await send(app, "/tasks", "POST", { title, ...(status ? { status } : {}) });
  assert.equal(response.status, 201);
  const task = await response.json();
  assert.equal(typeof task.id, "string");
  assert.ok(task.id);
  assert.equal(task.title, title.trim());
  return task;
};
await runCases("http", [
  [
    "empty",
    async ({ http }) => {
      const app = await http();
      assert.deepEqual(await (await app.request("/tasks")).json(), { items: [], total: 0 });
    },
  ],
  [
    "CRUD",
    async ({ http }) => {
      const app = await http(),
        task = await create(app, "  first  ");
      assert.equal(task.status, "todo");
      assert.deepEqual(await (await app.request(`/tasks/${task.id}`)).json(), task);
      const changed = await send(app, `/tasks/${task.id}`, "PATCH", { status: "done", title: "edited" });
      assert.equal(changed.status, 200);
      assert.deepEqual(await changed.json(), { ...task, status: "done", title: "edited" });
      const deleted = await app.request(`/tasks/${task.id}`, { method: "DELETE" });
      assert.equal(deleted.status, 204);
      assert.equal(await deleted.text(), "");
      assert.equal((await app.request(`/tasks/${task.id}`)).status, 404);
    },
  ],
  [
    "filter before pagination",
    async ({ http }) => {
      const app = await http();
      await create(app, "a");
      const b = await create(app, "b", "done");
      const c = await create(app, "c", "done");
      assert.notEqual(b.id, c.id);
      assert.deepEqual(await (await app.request("/tasks?status=done&offset=1&limit=1")).json(), { items: [c], total: 2 });
    },
  ],
  [
    "invalid create",
    async ({ http }) => {
      const app = await http();
      for (const body of [{ title: " " }, { title: "x".repeat(121) }, { title: "a", status: "bad" }, [], { title: "a", extra: 1 }])
        assert.equal((await send(app, "/tasks", "POST", body)).status, 400);
      assert.equal((await app.request("/tasks", { method: "POST", body: "{" })).status, 400);
      assert.deepEqual(await (await app.request("/tasks")).json(), { items: [], total: 0 });
    },
  ],
  [
    "atomic invalid update",
    async ({ http }) => {
      const app = await http(),
        task = await create(app, "a");
      for (const body of [{ title: "changed", status: "bad" }, {}, { extra: 1 }])
        assert.equal((await send(app, `/tasks/${task.id}`, "PATCH", body)).status, 400);
      assert.deepEqual(await (await app.request(`/tasks/${task.id}`)).json(), task);
    },
  ],
  [
    "invalid paging",
    async ({ http }) => {
      const app = await http();
      for (const query of ["limit=0", "limit=101", "limit=1.5", "offset=-1", "offset=no", "status=bad"])
        assert.equal((await app.request(`/tasks?${query}`)).status, 400);
    },
  ],
  [
    "missing IDs",
    async ({ http }) => {
      const app = await http();
      assert.equal((await app.request("/tasks/missing")).status, 404);
      assert.equal((await send(app, "/tasks/missing", "PATCH", { title: "x" })).status, 404);
      assert.equal((await app.request("/tasks/missing", { method: "DELETE" })).status, 404);
    },
  ],
]);
