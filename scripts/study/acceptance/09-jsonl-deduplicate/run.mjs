import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const lines = (text) =>
  text
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
const run = async (cli, input) => {
  const result = await cli(input);
  assert.equal(result.code, 0, result.stderr);
  return { records: lines(result.stdout), diagnostics: lines(result.stderr), raw: result.stdout };
};
await runCases("cli", [
  [
    "first wins in input order",
    async ({ cli }) => {
      const out = await run(cli, '{"id":"b","v":1}\n{"id":"a","v":2}\n{"id":"b","v":3}\n{"id":"a","v":4}\n');
      assert.deepEqual(out.records, [
        { id: "b", v: 1 },
        { id: "a", v: 2 },
      ]);
      assert.deepEqual(out.diagnostics, []);
    },
  ],
  [
    "compact output lines",
    async ({ cli }) => {
      const out = await run(cli, '{ "id" : "a" , "n" : [1, 2] }\n');
      assert.equal(out.raw, '{"id":"a","n":[1,2]}\n');
    },
  ],
  [
    "blank lines count for numbering and CRLF is accepted",
    async ({ cli }) => {
      const out = await run(cli, '{"id":"a"}\r\n\r\n   \r\nnot json\r\n{"id":"b"}\r\n');
      assert.deepEqual(out.records, [{ id: "a" }, { id: "b" }]);
      assert.deepEqual(out.diagnostics, [{ line: 4, reason: "malformed" }]);
    },
  ],
  [
    "malformed and non-object lines",
    async ({ cli }) => {
      const out = await run(cli, '{"id":\n[1]\n"x"\nnull\n7\n{"id":"ok"}\n');
      assert.deepEqual(out.records, [{ id: "ok" }]);
      assert.deepEqual(
        out.diagnostics,
        [1, 2, 3, 4, 5].map((line) => ({ line, reason: "malformed" })),
      );
    },
  ],
  [
    "missing or invalid ids",
    async ({ cli }) => {
      const out = await run(cli, '{"name":"x"}\n{"id":7}\n{"id":""}\n{"id":null}\n{"id":"7"}\n');
      assert.deepEqual(out.records, [{ id: "7" }]);
      assert.deepEqual(
        out.diagnostics,
        [1, 2, 3, 4].map((line) => ({ line, reason: "missing_id" })),
      );
    },
  ],
  [
    "invalid lines do not reserve ids",
    async ({ cli }) => {
      const out = await run(cli, '{"id":"a",\n{"id":"a","ok":true}\n');
      assert.deepEqual(out.records, [{ id: "a", ok: true }]);
    },
  ],
  [
    "unicode and id comparison is exact",
    async ({ cli }) => {
      const out = await run(cli, '{"id":"é","t":"😀 日本"}\n{"id":"É"}\n{"id":"e\u0301"}\n{"id":"é"}\n');
      assert.deepEqual(out.records, [{ id: "é", t: "😀 日本" }, { id: "É" }, { id: "é" }]);
    },
  ],
  [
    "empty input",
    async ({ cli }) => {
      const result = await cli("");
      assert.equal(result.code, 0);
      assert.equal(result.stdout, "");
    },
  ],
  [
    "large stream",
    async ({ cli }) => {
      const rows = [];
      for (let i = 0; i < 50000; i++) rows.push(JSON.stringify({ id: `id-${i % 20000}`, n: i }));
      rows.push("broken");
      const result = await cli(`${rows.join("\n")}\n`);
      assert.equal(result.code, 0, result.stderr);
      const out = result.stdout.split("\n").filter(Boolean);
      assert.equal(out.length, 20000);
      assert.deepEqual(JSON.parse(out[19999]), { id: "id-19999", n: 19999 });
      assert.equal(result.stderr.trim(), '{"line":50001,"reason":"malformed"}');
    },
  ],
]);
