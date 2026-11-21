import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const run = async (cli, input) => {
  const result = await cli(JSON.stringify(input));
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.endsWith("\n"));
  return JSON.parse(result.stdout);
};
const fails = async (cli, text) => {
  const result = await cli(text);
  assert.notEqual(result.code, 0, text);
  assert.equal(result.stdout, "");
  assert.ok(result.stderr.trim());
};
await runCases("cli", [
  [
    "matching rows and unmatched sides",
    async ({ cli }) => {
      const out = await run(cli, { key: "id", left: "id,name\n1,a\n2,b\n", right: "id,age\n2,30\n3,40\n" });
      assert.deepEqual(out, {
        columns: ["id", "name", "age"],
        rows: [
          ["1", "a", null],
          ["2", "b", "30"],
          ["3", null, "40"],
        ],
        rejected: { left: 0, right: 0 },
      });
    },
  ],
  [
    "colliding column names are prefixed",
    async ({ cli }) => {
      const out = await run(cli, { key: "k", left: "name,k,v\nA,1,x\n", right: "v,k,name,extra\ny,1,B,e\n" });
      assert.deepEqual(out.columns, ["k", "left_name", "left_v", "right_v", "right_name", "extra"]);
      assert.deepEqual(out.rows, [["1", "A", "x", "y", "B", "e"]]);
    },
  ],
  [
    "repeated keys multiply in left-outer right-inner order",
    async ({ cli }) => {
      const out = await run(cli, { key: "k", left: "k,l\n1,a\n1,b\n", right: "k,r\n1,x\n1,y\n1,z\n" });
      assert.deepEqual(out.rows, [
        ["1", "a", "x"],
        ["1", "a", "y"],
        ["1", "a", "z"],
        ["1", "b", "x"],
        ["1", "b", "y"],
        ["1", "b", "z"],
      ]);
    },
  ],
  [
    "one-sided repeated keys",
    async ({ cli }) => {
      const out = await run(cli, { key: "k", left: "k,l\n1,a\n1,b\n2,c\n", right: "k,r\n3,x\n3,y\n" });
      assert.deepEqual(out.rows, [
        ["1", "a", null],
        ["1", "b", null],
        ["2", "c", null],
        ["3", null, "x"],
        ["3", null, "y"],
      ]);
    },
  ],
  [
    "rows are ordered by key code units, not input order",
    async ({ cli }) => {
      const out = await run(cli, { key: "k", left: "k,l\nb,1\n10,2\na,3\n", right: "k,r\n2,x\nB,y\n" });
      assert.deepEqual(
        out.rows.map((row) => row[0]),
        ["10", "2", "B", "a", "b"],
      );
    },
  ],
  [
    "empty sides",
    async ({ cli }) => {
      assert.deepEqual(await run(cli, { key: "k", left: "k,l\n", right: "k,r\n" }), {
        columns: ["k", "l", "r"],
        rows: [],
        rejected: { left: 0, right: 0 },
      });
      const out = await run(cli, { key: "k", left: "k,l", right: "k,r\n1,x\n" });
      assert.deepEqual(out.rows, [["1", null, "x"]]);
    },
  ],
  [
    "quoted cells, BOM and CRLF",
    async ({ cli }) => {
      const out = await run(cli, {
        key: "k",
        left: '﻿k,note\r\n"a,1","line1\nline2"\r\n\r\n',
        right: 'k,tag\r\n"a,1","say ""hi"""\r\n',
      });
      assert.deepEqual(out.rows, [["a,1", "line1\nline2", 'say "hi"']]);
    },
  ],
  [
    "rejected records",
    async ({ cli }) => {
      const out = await run(cli, { key: "k", left: "k,l\n1,a\n,b\n2\n3,c,d\n4,e\n", right: "k,r\n1,x\n,y\n" });
      assert.deepEqual(out.rows, [
        ["1", "a", "x"],
        ["4", "e", null],
      ]);
      assert.deepEqual(out.rejected, { left: 3, right: 1 });
    },
  ],
  [
    "keys compare exactly",
    async ({ cli }) => {
      const out = await run(cli, { key: "k", left: "k,l\n1,a\n01,b\n A,c\n", right: "k,r\n1,x\nA,y\n" });
      assert.deepEqual(out.rows, [
        [" A", "c", null],
        ["01", "b", null],
        ["1", "a", "x"],
        ["A", null, "y"],
      ]);
    },
  ],
  [
    "invalid input",
    async ({ cli }) => {
      const good = "k,v\n1,a\n";
      for (const input of [
        { key: "k", left: "x,v\n1,a\n", right: good },
        { key: "k", left: good, right: "x,v\n" },
        { key: "k", left: "k,k\n1,2\n", right: good },
        { key: "k", left: "", right: good },
        { key: "k", left: good, right: 'k,v\n"abc,1\n' },
        { key: "k", left: good, right: 'k,v\n"a"b,1\n' },
        { key: "k", left: good },
        { key: "", left: good, right: good },
      ])
        await fails(cli, JSON.stringify(input));
      await fails(cli, "{");
      await fails(cli, "[]");
    },
  ],
]);
