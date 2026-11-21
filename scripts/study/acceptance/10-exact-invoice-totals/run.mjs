import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const run = async (cli, rows) => {
  const result = await cli(JSON.stringify(rows));
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.endsWith("\n"));
  return JSON.parse(result.stdout);
};
const row = (customer, currency, amount) => ({ customer, currency, amount });
const group = (customer, currency, total, rows) => ({ customer, currency, total, rows });
await runCases("cli", [
  [
    "exact decimal sums",
    async ({ cli }) => {
      const out = await run(cli, [row("a", "USD", "0.10"), row("a", "USD", "0.20"), row("a", "USD", "0.30"), row("a", "USD", "10")]);
      assert.deepEqual(out, { groups: [group("a", "USD", "10.60", 4)], rejected: [] });
    },
  ],
  [
    "currencies never mix and groups are sorted",
    async ({ cli }) => {
      const out = await run(cli, [
        row("b", "USD", "1"),
        row("a", "EUR", "2"),
        row("a", "USD", "3"),
        row("B", "USD", "4"),
        row("a", "USD", "5"),
      ]);
      assert.deepEqual(out.groups, [
        group("B", "USD", "4.00", 1),
        group("a", "EUR", "2.00", 1),
        group("a", "USD", "8.00", 2),
        group("b", "USD", "1.00", 1),
      ]);
    },
  ],
  [
    "round half to even per row",
    async ({ cli }) => {
      const out = await run(cli, [
        row("a", "USD", "0.125"),
        row("b", "USD", "0.135"),
        row("c", "USD", "0.1251"),
        row("d", "USD", "-0.125"),
        row("e", "USD", "2.675"),
        row("f", "USD", "1.005"),
        row("g", "USD", "1.015"),
      ]);
      assert.deepEqual(
        out.groups.map((entry) => entry.total),
        ["0.12", "0.14", "0.13", "-0.12", "2.68", "1.00", "1.02"],
      );
    },
  ],
  [
    "rounding happens before summing",
    async ({ cli }) => {
      const out = await run(cli, [row("a", "USD", "0.004"), row("a", "USD", "0.004"), row("a", "USD", "0.004"), row("a", "USD", "0.006")]);
      assert.deepEqual(out.groups, [group("a", "USD", "0.01", 4)]);
    },
  ],
  [
    "JPY has no decimals",
    async ({ cli }) => {
      const out = await run(cli, [row("a", "JPY", "100.5"), row("a", "JPY", "200.5"), row("b", "JPY", "-0.5")]);
      assert.deepEqual(out.groups, [group("a", "JPY", "300", 2), group("b", "JPY", "0", 1)]);
    },
  ],
  [
    "negative adjustments and no negative zero",
    async ({ cli }) => {
      const out = await run(cli, [
        row("a", "USD", "5.00"),
        row("a", "USD", "-7.25"),
        row("b", "USD", "-0.004"),
        row("c", "USD", "1.00"),
        row("c", "USD", "-1.00"),
      ]);
      assert.deepEqual(out.groups, [group("a", "USD", "-2.25", 2), group("b", "USD", "0.00", 1), group("c", "USD", "0.00", 2)]);
    },
  ],
  [
    "large exact values",
    async ({ cli }) => {
      const out = await run(cli, [
        row("a", "USD", "9007199254740993.01"),
        row("a", "USD", "0.02"),
        row("a", "USD", "123456789012345678901234567890"),
      ]);
      assert.deepEqual(out.groups, [group("a", "USD", "123456789012354686100489308883.03", 3)]);
    },
  ],
  [
    "invalid rows are rejected by index",
    async ({ cli }) => {
      const out = await run(cli, [
        row("a", "USD", "1.00"),
        row("", "USD", "1"),
        row("a", "usd", "1"),
        row("a", "USD", "1e3"),
        row("a", "USD", " 1"),
        row("a", "USD", 1),
        { customer: "a", currency: "USD" },
        null,
        "x",
        row("a", "USD", ".5"),
        row("a", "USD", "+1"),
        row("a", "USD", "1."),
        row("a", "USDX", "1"),
        row("a", "USD", "2.50"),
      ]);
      assert.deepEqual(out, { groups: [group("a", "USD", "3.50", 2)], rejected: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] });
    },
  ],
  [
    "empty array and invalid input",
    async ({ cli }) => {
      assert.deepEqual(await run(cli, []), { groups: [], rejected: [] });
      for (const input of ["{", "{}", "null"]) {
        const result = await cli(input);
        assert.notEqual(result.code, 0);
        assert.equal(result.stdout, "");
        assert.ok(result.stderr.trim());
      }
    },
  ],
]);
