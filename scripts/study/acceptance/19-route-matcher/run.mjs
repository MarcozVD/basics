import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const route = (name, pattern) => ({ name, pattern });
const match = async (cli, routes, requests) => {
  const result = await cli(JSON.stringify({ routes, requests }));
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.endsWith("\n"));
  return JSON.parse(result.stdout).results;
};
const hit = (name, params = {}) => ({ route: name, params });
const miss = { route: null, params: {} };
const badRequest = { error: "bad_request" };
await runCases("cli", [
  [
    "static, parameter and root routes",
    async ({ cli }) => {
      const routes = [route("root", "/"), route("users", "/users"), route("user", "/users/:id"), route("post", "/users/:id/posts/:post")];
      assert.deepEqual(await match(cli, routes, ["/", "/users", "/users/42", "/users/42/posts/7", "/users/42/posts", "/other"]), [
        hit("root"),
        hit("users"),
        hit("user", { id: "42" }),
        hit("post", { id: "42", post: "7" }),
        miss,
        miss,
      ]);
    },
  ],
  [
    "precedence: static beats parameter beats wildcard, decided left to right",
    async ({ cli }) => {
      const routes = [
        route("wild", "/files/*"),
        route("param", "/files/:name"),
        route("static", "/files/readme"),
        route("deep-param", "/a/:x/c"),
        route("deep-static", "/a/b/:y"),
      ];
      assert.deepEqual(await match(cli, routes, ["/files/readme", "/files/other", "/files/a/b", "/a/b/c", "/a/z/c", "/a/b/z"]), [
        hit("static"),
        hit("param", { name: "other" }),
        hit("wild", { "*": "a/b" }),
        hit("deep-static", { y: "c" }),
        hit("deep-param", { x: "z" }),
        hit("deep-static", { y: "z" }),
      ]);
    },
  ],
  [
    "equally specific routes: first listed wins",
    async ({ cli }) => {
      const routes = [route("first", "/x/:a"), route("second", "/x/:b")];
      assert.deepEqual(await match(cli, routes, ["/x/1"]), [hit("first", { a: "1" })]);
    },
  ],
  [
    "wildcard needs one or more segments",
    async ({ cli }) => {
      const routes = [route("all", "/static/*")];
      assert.deepEqual(await match(cli, routes, ["/static", "/static/", "/static/a", "/static/a/b/c"]), [
        miss,
        miss,
        hit("all", { "*": "a" }),
        hit("all", { "*": "a/b/c" }),
      ]);
    },
  ],
  [
    "trailing slash and query are ignored",
    async ({ cli }) => {
      const routes = [route("users", "/users"), route("user", "/users/:id"), route("root", "/")];
      assert.deepEqual(await match(cli, routes, ["/users/", "/users?x=1", "/users/9/?q=/a//b", "/?a=1", "/users/5?id=7"]), [
        hit("users"),
        hit("users"),
        hit("user", { id: "9" }),
        hit("root"),
        hit("user", { id: "5" }),
      ]);
    },
  ],
  [
    "percent decoding",
    async ({ cli }) => {
      const routes = [route("greet", "/hello world"), route("item", "/items/:name"), route("any", "/any/*")];
      assert.deepEqual(
        await match(cli, routes, ["/hello%20world", "/items/caf%C3%A9", "/items/a%2Fb", "/any/a%2Fb/c%20d", "/items/100%25"]),
        [
          hit("greet"),
          hit("item", { name: "café" }),
          hit("item", { name: "a/b" }),
          hit("any", { "*": "a/b/c d" }),
          hit("item", { name: "100%" }),
        ],
      );
    },
  ],
  [
    "escaped static segments",
    async ({ cli }) => {
      const routes = [route("colon", "/tags/\\:new"), route("star", "/tags/\\*"), route("param", "/tags/:name")];
      assert.deepEqual(await match(cli, routes, ["/tags/:new", "/tags/*", "/tags/other", "/tags/%3Anew"]), [
        hit("colon"),
        hit("star"),
        hit("param", { name: "other" }),
        hit("colon"),
      ]);
    },
  ],
  [
    "bad requests",
    async ({ cli }) => {
      const routes = [route("any", "/a/*"), route("root", "/")];
      assert.deepEqual(await match(cli, routes, ["a/b", "//a", "/a//b", "/a/%E0%A4%A", "/a/%zz", "", "/a/b//"]), Array(7).fill(badRequest));
    },
  ],
  [
    "malformed routes and input",
    async ({ cli }) => {
      const bad = [
        [route("r", "users")],
        [route("r", "/users/")],
        [route("r", "/a//b")],
        [route("r", "/a/:")],
        [route("r", "/a/:Bad")],
        [route("r", "/a/:1")],
        [route("r", "/a/*/b")],
        [route("r", "/a/:x/:x")],
        [route("r", "/a"), route("r", "/b")],
        [route("", "/a")],
        [{ name: "r" }],
      ];
      for (const routes of bad) {
        const result = await cli(JSON.stringify({ routes, requests: ["/a"] }));
        assert.notEqual(result.code, 0, JSON.stringify(routes));
        assert.equal(result.stdout, "");
        assert.ok(result.stderr.trim());
      }
      for (const input of ["{", "[]", '{"routes":[]}', '{"routes":[],"requests":[1]}']) {
        const result = await cli(input);
        assert.notEqual(result.code, 0, input);
        assert.equal(result.stdout, "");
      }
      assert.deepEqual(await match(cli, [], ["/a"]), [miss]);
      assert.deepEqual(await match(cli, [route("r", "/a")], []), []);
    },
  ],
]);
