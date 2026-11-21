import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const check =
  (input, order, cycle = false) =>
  async ({ cli }) => {
    const result = await cli(JSON.stringify(input));
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { order, cycle });
  };
await runCases("cli", [
  ["direction", check({ nodes: ["a", "b"], edges: [["b", "a"]] }, ["b", "a"])],
  [
    "ready-set lexical order",
    check(
      {
        nodes: ["z", "b", "c", "a"],
        edges: [
          ["a", "c"],
          ["b", "c"],
        ],
      },
      ["a", "b", "c", "z"],
    ),
  ],
  [
    "duplicate edges",
    check(
      {
        nodes: ["b", "a"],
        edges: [
          ["a", "b"],
          ["a", "b"],
        ],
      },
      ["a", "b"],
    ),
  ],
  [
    "cycle",
    check(
      {
        nodes: ["a", "b", "c"],
        edges: [
          ["a", "b"],
          ["b", "a"],
        ],
      },
      [],
      true,
    ),
  ],
  ["self cycle", check({ nodes: ["a"], edges: [["a", "a"]] }, [], true)],
  ["empty", check({ nodes: [], edges: [] }, [])],
  [
    "invalid inputs",
    async ({ cli }) => {
      for (const input of [
        "{",
        '{"nodes":["a","a"],"edges":[]}',
        '{"nodes":["a"],"edges":[["a","b"]]}',
        '{"nodes":["A"],"edges":[]}',
        '{"nodes":[],"edges":[],"extra":1}',
      ]) {
        const result = await cli(input);
        assert.notEqual(result.code, 0);
        assert.equal(result.stdout, "");
        assert.ok(result.stderr.trim());
      }
    },
  ],
]);
