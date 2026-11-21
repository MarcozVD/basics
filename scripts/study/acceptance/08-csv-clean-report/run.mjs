import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const run = async (cli, csv) => {
  const result = await cli(csv);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.endsWith("\n"));
  return JSON.parse(result.stdout);
};
const summary = (accepted, malformed = 0, invalid = 0, duplicate = 0) => ({ accepted, rejected: { malformed, invalid, duplicate } });
await runCases("cli", [
  [
    "basic rows and trimming",
    async ({ cli }) => {
      const out = await run(cli, "id,name,amount\n1, Ada ,10.5\n2,Bob,\n3,Cy,7\n");
      assert.deepEqual(out, {
        rows: [
          { id: "1", name: "Ada", amount: "10.5" },
          { id: "2", name: "Bob", amount: null },
          { id: "3", name: "Cy", amount: "7" },
        ],
        summary: summary(3),
      });
    },
  ],
  [
    "quoted commas, quotes and line breaks",
    async ({ cli }) => {
      const out = await run(cli, 'id,name,amount\n1,"Smith, ""Al""\nJr",2.25\n');
      assert.deepEqual(out.rows, [{ id: "1", name: 'Smith, "Al"\nJr', amount: "2.25" }]);
    },
  ],
  [
    "BOM, CRLF and blank lines",
    async ({ cli }) => {
      const out = await run(cli, "﻿id,name,amount\r\n\r\n1,A,1\r\n\r\n2,B,2\r\n");
      assert.deepEqual(out, {
        rows: [
          { id: "1", name: "A", amount: "1" },
          { id: "2", name: "B", amount: "2" },
        ],
        summary: summary(2),
      });
    },
  ],
  ["header only", async ({ cli }) => assert.deepEqual(await run(cli, "id,name,amount"), { rows: [], summary: summary(0) })],
  [
    "malformed rows",
    async ({ cli }) => {
      const out = await run(cli, "id,name,amount\n1,A\n2,B,1,x\n3,C,3\n");
      assert.deepEqual(out, { rows: [{ id: "3", name: "C", amount: "3" }], summary: summary(1, 2) });
    },
  ],
  [
    "invalid rows",
    async ({ cli }) => {
      const out = await run(cli, "id,name,amount\nx1,A,1\n2, ,1\n3,C,1.234\n4,D,-1\n5,E,.5\n6,F,6\n");
      assert.deepEqual(out, { rows: [{ id: "6", name: "F", amount: "6" }], summary: summary(1, 0, 5) });
    },
  ],
  [
    "duplicates keep the first accepted",
    async ({ cli }) => {
      const out = await run(cli, "id,name,amount\n1,A,1\n1,B,2\nx,C,1\n007,D,3\n7,E,4\n1,F,5\n");
      assert.deepEqual(out.rows, [
        { id: "1", name: "A", amount: "1" },
        { id: "007", name: "D", amount: "3" },
        { id: "7", name: "E", amount: "4" },
      ]);
      assert.deepEqual(out.summary, summary(3, 0, 1, 2));
    },
  ],
  [
    "invalid id does not reserve the id",
    async ({ cli }) => {
      const out = await run(cli, "id,name,amount\n1, ,1\n1,A,1\n");
      assert.deepEqual(out.rows, [{ id: "1", name: "A", amount: "1" }]);
      assert.deepEqual(out.summary, summary(1, 0, 1));
    },
  ],
  [
    "unicode",
    async ({ cli }) => {
      const out = await run(cli, 'id,name,amount\n1,"Zoë 😀",3\n');
      assert.equal(out.rows[0].name, "Zoë 😀");
    },
  ],
  [
    "invalid input",
    async ({ cli }) => {
      for (const input of ["", "id,name\n1,A\n", "name,id,amount\n", 'id,name,amount\n1,"abc,1\n', 'id,name,amount\n1,"a"b,1\n']) {
        const result = await cli(input);
        assert.notEqual(result.code, 0, input);
        assert.equal(result.stdout, "");
        assert.ok(result.stderr.trim());
      }
    },
  ],
]);
