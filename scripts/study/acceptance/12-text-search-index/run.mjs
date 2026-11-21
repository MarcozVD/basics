import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const search = async (cli, documents, query) => {
  const result = await cli(JSON.stringify({ documents, query }));
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.endsWith("\n"));
  return JSON.parse(result.stdout).results;
};
const doc = (id, text) => ({ id, text });
await runCases("cli", [
  [
    "scores count token occurrences",
    async ({ cli }) => {
      const results = await search(cli, [doc("a", "red red blue"), doc("b", "red"), doc("c", "green")], "red");
      assert.deepEqual(results, [
        { id: "a", score: 2 },
        { id: "b", score: 1 },
      ]);
    },
  ],
  [
    "multi-token queries sum distinct tokens",
    async ({ cli }) => {
      const results = await search(cli, [doc("a", "red blue blue"), doc("b", "red red red"), doc("c", "blue")], "red blue");
      assert.deepEqual(results, [
        { id: "a", score: 3 },
        { id: "b", score: 3 },
        { id: "c", score: 1 },
      ]);
    },
  ],
  [
    "repeated query tokens count once",
    async ({ cli }) => {
      const results = await search(cli, [doc("a", "x x")], "x X x");
      assert.deepEqual(results, [{ id: "a", score: 2 }]);
    },
  ],
  [
    "ties order by id in code units",
    async ({ cli }) => {
      const results = await search(cli, [doc("b", "t"), doc("B", "t"), doc("a", "t"), doc("10", "t"), doc("9", "t")], "t");
      assert.deepEqual(
        results.map((entry) => entry.id),
        ["10", "9", "B", "a", "b"],
      );
    },
  ],
  [
    "punctuation separates tokens",
    async ({ cli }) => {
      const results = await search(cli, [doc("a", "state-of-the-art, e-mail: foo_bar 3.14"), doc("b", "stateoftheart")], "art mail bar 14");
      assert.deepEqual(results, [{ id: "a", score: 4 }]);
    },
  ],
  [
    "ASCII case insensitive only",
    async ({ cli }) => {
      const results = await search(
        cli,
        [doc("a", "HELLO Hello hello"), doc("b", "ÉCOLE école"), doc("c", "Straße STRASSE")],
        "hello école strasse",
      );
      assert.deepEqual(results, [
        { id: "a", score: 3 },
        { id: "b", score: 1 },
        { id: "c", score: 1 },
      ]);
    },
  ],
  [
    "unicode letters and digits form tokens",
    async ({ cli }) => {
      const results = await search(cli, [doc("a", "日本語 テスト 😀 naïve ١٢٣"), doc("b", "naive")], "日本語 naïve ١٢٣ 😀");
      assert.deepEqual(results, [{ id: "a", score: 3 }]);
    },
  ],
  [
    "empty and tokenless queries, no matches",
    async ({ cli }) => {
      assert.deepEqual(await search(cli, [doc("a", "x")], ""), []);
      assert.deepEqual(await search(cli, [doc("a", "x")], " ,.- "), []);
      assert.deepEqual(await search(cli, [doc("a", "x")], "y"), []);
      assert.deepEqual(await search(cli, [], "y"), []);
    },
  ],
  [
    "invalid input",
    async ({ cli }) => {
      for (const input of [
        "{",
        "[]",
        '{"documents":[{"id":"a","text":"x"},{"id":"a","text":"y"}],"query":"x"}',
        '{"documents":[{"id":"","text":"x"}],"query":"x"}',
        '{"documents":[{"id":"a"}],"query":"x"}',
        '{"documents":[],"query":5}',
        '{"query":"x"}',
      ]) {
        const result = await cli(input);
        assert.notEqual(result.code, 0, input);
        assert.equal(result.stdout, "");
        assert.ok(result.stderr.trim());
      }
    },
  ],
]);
