import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const check =
  (input, expected) =>
  async ({ cli }) => {
    const result = await cli(JSON.stringify(input));
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), expected);
  };
await runCases("cli", [
  ["nested replacement", check([{ a: { b: 1, c: 2 } }, { a: { b: 3 } }], { a: { b: 3, c: 2 } })],
  [
    "null deletion",
    check(
      [
        { a: 1, nested: { x: 2, y: 3 } },
        { a: null, nested: { x: null }, absent: null },
      ],
      { nested: { y: 3 } },
    ),
  ],
  ["array replacement", check([{ a: [1, 2] }, { a: [3] }], { a: [3] })],
  ["object replaces scalar", check([{ a: 8 }, { a: { x: null, y: [null, 1] } }], { a: { y: [null, 1] } })],
  ["empty overlays", check([], {})],
  [
    "ordinary keys",
    async ({ cli }) => {
      const result = await cli('[{"__proto__":{"flag":1},"constructor":2,"ñ":"sí"}]');
      assert.equal(result.code, 0);
      assert.deepEqual(JSON.parse(result.stdout), JSON.parse('{"__proto__":{"flag":1},"constructor":2,"ñ":"sí"}'));
    },
  ],
  [
    "invalid inputs",
    async ({ cli }) => {
      for (const input of ["{", "{}", "[null]", "[[]]", "[1]"]) {
        const result = await cli(input);
        assert.notEqual(result.code, 0);
        assert.equal(result.stdout, "");
        assert.ok(result.stderr.trim());
      }
    },
  ],
]);
