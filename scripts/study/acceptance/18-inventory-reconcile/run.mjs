import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const run = async (cli, expected, observed) => {
  const result = await cli(JSON.stringify({ expected, observed }));
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.endsWith("\n"));
  return JSON.parse(result.stdout);
};
const none = { expected: 0, observed: 0 };
await runCases("cli", [
  [
    "additions, removals and changes",
    async ({ cli }) => {
      const out = await run(cli, "sku,qty\nA,5\nB,2\nC,7\n", "sku,qty\nA,5\nC,9\nD,1\n");
      assert.deepEqual(out, {
        additions: [{ sku: "D", qty: 1 }],
        removals: [{ sku: "B", qty: 2 }],
        changes: [{ sku: "C", expected: 7, observed: 9 }],
        rejected: none,
      });
    },
  ],
  [
    "unchanged records are omitted and identical inputs give empty output",
    async ({ cli }) => {
      const out = await run(cli, "sku,qty\nA,1\nB,0\n", "sku,qty\nB,0\nA,1\n");
      assert.deepEqual(out, { additions: [], removals: [], changes: [], rejected: none });
    },
  ],
  [
    "zero quantities still count as present",
    async ({ cli }) => {
      const out = await run(cli, "sku,qty\nA,0\nB,3\nC,0\n", "sku,qty\nA,2\nB,0\nD,0\n");
      assert.deepEqual(out, {
        additions: [{ sku: "D", qty: 0 }],
        removals: [{ sku: "C", qty: 0 }],
        changes: [
          { sku: "A", expected: 0, observed: 2 },
          { sku: "B", expected: 3, observed: 0 },
        ],
        rejected: none,
      });
    },
  ],
  [
    "output is sorted by sku in code-unit order and ignores input order",
    async ({ cli }) => {
      const out = await run(cli, "sku,qty\nb,1\nB,1\n10,1\n", "sku,qty\nz,1\na,1\nZ,1\n9,1\n");
      assert.deepEqual(
        out.additions.map((entry) => entry.sku),
        ["9", "Z", "a", "z"],
      );
      assert.deepEqual(
        out.removals.map((entry) => entry.sku),
        ["10", "B", "b"],
      );
    },
  ],
  [
    "invalid and malformed rows are rejected per side",
    async ({ cli }) => {
      const out = await run(cli, "sku,qty\nA,1\n,2\nB,x\nC,-1\nD,1.5\nE\nF,1,2\nG, 7 \n", "sku,qty\nA,1\nH,\n  ,4\nG,7\n");
      assert.deepEqual(out, { additions: [], removals: [], changes: [], rejected: { expected: 6, observed: 2 } });
    },
  ],
  [
    "duplicates: first accepted wins and rejected duplicates are counted",
    async ({ cli }) => {
      const out = await run(cli, "sku,qty\nA,1\nA,2\nB,x\nB,3\nA,9\n", "sku,qty\nA,1\nB,3\nB,4\n");
      assert.deepEqual(out, { additions: [], removals: [], changes: [], rejected: { expected: 3, observed: 1 } });
    },
  ],
  [
    "quoted fields, BOM, CRLF and blank lines",
    async ({ cli }) => {
      const out = await run(cli, '﻿sku,qty\r\n"A,1",5\r\n\r\n"B ""x""",1\r\n', 'sku,qty\r\n"A,1",6\r\n');
      assert.deepEqual(out, {
        additions: [],
        removals: [{ sku: 'B "x"', qty: 1 }],
        changes: [{ sku: "A,1", expected: 5, observed: 6 }],
        rejected: none,
      });
    },
  ],
  [
    "header-only sides",
    async ({ cli }) => {
      assert.deepEqual(await run(cli, "sku,qty\n", "sku,qty\nA,1\n"), {
        additions: [{ sku: "A", qty: 1 }],
        removals: [],
        changes: [],
        rejected: none,
      });
      assert.deepEqual(await run(cli, "sku,qty\nA,1", "sku,qty"), {
        additions: [],
        removals: [{ sku: "A", qty: 1 }],
        changes: [],
        rejected: none,
      });
    },
  ],
  [
    "invalid input",
    async ({ cli }) => {
      const good = "sku,qty\nA,1\n";
      for (const input of [
        { expected: "qty,sku\n", observed: good },
        { expected: good, observed: "sku\nA\n" },
        { expected: "", observed: good },
        { expected: good, observed: 'sku,qty\n"A,1\n' },
        { expected: good, observed: 'sku,qty\n"a"b,1\n' },
        { expected: good },
        { expected: 1, observed: good },
      ]) {
        const result = await cli(JSON.stringify(input));
        assert.notEqual(result.code, 0, JSON.stringify(input));
        assert.equal(result.stdout, "");
        assert.ok(result.stderr.trim());
      }
      const broken = await cli("{");
      assert.notEqual(broken.code, 0);
      assert.equal(broken.stdout, "");
    },
  ],
]);
