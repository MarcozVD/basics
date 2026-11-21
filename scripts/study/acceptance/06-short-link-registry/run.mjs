import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const create = (app, alias, target) =>
  app.request("/links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ alias, target }) });
const redirect = (app, alias) => app.request(`/r/${alias}`, { redirect: "manual" });
await runCases("http", [
  [
    "create, read and delete a link",
    async ({ http }) => {
      const app = await http();
      const response = await create(app, "docs", "https://example.com/docs");
      assert.equal(response.status, 201);
      assert.deepEqual(await response.json(), { alias: "docs", target: "https://example.com/docs" });
      assert.deepEqual(await (await app.request("/links/docs")).json(), { alias: "docs", target: "https://example.com/docs" });
      const deleted = await app.request("/links/docs", { method: "DELETE" });
      assert.equal(deleted.status, 204);
      assert.equal(await deleted.text(), "");
      assert.equal((await app.request("/links/docs")).status, 404);
      assert.equal((await app.request("/links/docs", { method: "DELETE" })).status, 404);
    },
  ],
  [
    "targets are normalized by the WHATWG URL parser",
    async ({ http }) => {
      const app = await http();
      const cases = [
        ["https://example.com/a b?q=ü", "https://example.com/a%20b?q=%C3%BC"],
        ["HTTP://EXAMPLE.com", "http://example.com/"],
        ["https://example.com:443/x", "https://example.com/x"],
        ["http://example.com/a/../b#frag", "http://example.com/b#frag"],
        ["https://bücher.example/", "https://xn--bcher-kva.example/"],
      ];
      for (const [index, [input, normalized]] of cases.entries()) {
        const response = await create(app, `n${index}`, input);
        assert.equal(response.status, 201, input);
        assert.equal((await response.json()).target, normalized);
        assert.equal((await (await app.request(`/links/n${index}`)).json()).target, normalized);
      }
    },
  ],
  [
    "redirect is a 302 with the stored target and an empty body",
    async ({ http }) => {
      const app = await http();
      await create(app, "go", "https://example.com/a b?q=ü");
      const response = await redirect(app, "go");
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), "https://example.com/a%20b?q=%C3%BC");
      assert.equal(await response.text(), "");
      assert.equal((await redirect(app, "missing")).status, 404);
      assert.equal((await redirect(app, "GO")).status, 404);
    },
  ],
  [
    "the service never contacts the targets",
    async ({ http }) => {
      const app = await http();
      await create(app, "dead", "http://127.0.0.1:1/never-fetched");
      const response = await redirect(app, "dead");
      assert.equal(response.status, 302);
      assert.equal(response.headers.get("location"), "http://127.0.0.1:1/never-fetched");
    },
  ],
  [
    "alias conflicts and recreation after delete",
    async ({ http }) => {
      const app = await http();
      assert.equal((await create(app, "a", "https://one.example/")).status, 201);
      assert.equal((await create(app, "a", "https://two.example/")).status, 409);
      assert.equal((await (await app.request("/links/a")).json()).target, "https://one.example/");
      assert.equal((await app.request("/links/a", { method: "DELETE" })).status, 204);
      assert.equal((await create(app, "a", "https://two.example/")).status, 201);
      assert.equal((await redirect(app, "a")).headers.get("location"), "https://two.example/");
    },
  ],
  [
    "invalid aliases",
    async ({ http }) => {
      const app = await http();
      for (const alias of ["", "A", "-a", "a_b", "a b", "a/b", "x".repeat(33), "é", 5, null])
        assert.equal((await create(app, alias, "https://example.com/")).status, 400, String(alias));
      assert.equal((await create(app, "x".repeat(32), "https://example.com/")).status, 201);
      assert.equal((await create(app, "0", "https://example.com/")).status, 201);
    },
  ],
  [
    "invalid targets",
    async ({ http }) => {
      const app = await http();
      const bad = [
        "ftp://example.com/",
        "javascript:alert(1)",
        "file:///etc/passwd",
        "example.com",
        "//example.com/x",
        "/relative",
        "https://",
        "https://user@example.com/",
        "https://user:pw@example.com/",
        "https://exa mple.com/",
        `https://example.com/${"a".repeat(2048)}`,
        "",
        5,
        null,
      ];
      for (const target of bad) assert.equal((await create(app, "t", target)).status, 400, String(target));
      assert.equal((await app.request("/links/t")).status, 404);
      assert.equal((await create(app, "t", `https://example.com/${"a".repeat(2000)}`)).status, 201);
    },
  ],
  [
    "malformed bodies",
    async ({ http }) => {
      const app = await http();
      for (const body of [
        "{",
        "[]",
        "null",
        '{"alias":"a"}',
        '{"target":"https://example.com/"}',
        '{"alias":"a","target":"https://example.com/","extra":1}',
      ])
        assert.equal((await app.request("/links", { method: "POST", body })).status, 400, body);
      assert.equal((await app.request("/links/a")).status, 404);
    },
  ],
]);
