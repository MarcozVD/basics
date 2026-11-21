import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const run = async (cli, ops) => {
  const result = await cli(JSON.stringify(ops));
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.endsWith("\n"));
  return JSON.parse(result.stdout);
};
const dep = (id, account, amount) => ({ id, type: "deposit", account, amount });
const wd = (id, account, amount) => ({ id, type: "withdraw", account, amount });
const tr = (id, from, to, amount) => ({ id, type: "transfer", from, to, amount });
const status = (out) => out.history.map((entry) => (entry.reason ? `${entry.status}:${entry.reason}` : entry.status));
await runCases("cli", [
  [
    "deposits, withdrawals and transfers with exact balances",
    async ({ cli }) => {
      const out = await run(cli, [
        dep("1", "a", "10.10"),
        dep("2", "a", "0.20"),
        dep("3", "b", "5"),
        wd("4", "a", "0.30"),
        tr("5", "a", "b", "4.5"),
      ]);
      assert.deepEqual(out.balances, { a: "5.50", b: "9.50" });
      assert.deepEqual(status(out), ["applied", "applied", "applied", "applied", "applied"]);
      assert.deepEqual(
        out.history.map((entry) => entry.id),
        ["1", "2", "3", "4", "5"],
      );
    },
  ],
  [
    "insufficient funds change nothing",
    async ({ cli }) => {
      const out = await run(cli, [
        dep("1", "a", "1.00"),
        wd("2", "a", "1.01"),
        tr("3", "a", "b", "1"),
        dep("4", "b", "0.50"),
        tr("5", "a", "b", "1.01"),
        wd("6", "a", "1.00"),
      ]);
      assert.deepEqual(status(out), [
        "applied",
        "rejected:insufficient_funds",
        "rejected:unknown_account",
        "applied",
        "rejected:insufficient_funds",
        "applied",
      ]);
      assert.deepEqual(out.balances, { a: "0.00", b: "0.50" });
    },
  ],
  [
    "unknown accounts and no implicit creation",
    async ({ cli }) => {
      const out = await run(cli, [wd("1", "ghost", "1"), dep("2", "a", "5"), tr("3", "a", "ghost", "1"), tr("4", "ghost", "a", "1")]);
      assert.deepEqual(status(out), ["rejected:unknown_account", "applied", "rejected:unknown_account", "rejected:unknown_account"]);
      assert.deepEqual(out.balances, { a: "5.00" });
    },
  ],
  [
    "same-account transfers are rejected",
    async ({ cli }) => {
      const out = await run(cli, [dep("1", "a", "5"), tr("2", "a", "a", "1")]);
      assert.deepEqual(status(out), ["applied", "rejected:same_account"]);
      assert.deepEqual(out.balances, { a: "5.00" });
    },
  ],
  [
    "replayed ids: identical is duplicate, different is id_conflict",
    async ({ cli }) => {
      const out = await run(cli, [
        dep("x", "a", "5"),
        dep("x", "a", "5"),
        dep("x", "a", "6"),
        { amount: "5", account: "a", type: "deposit", id: "x" },
        wd("y", "a", "100"),
        dep("y", "a", "1"),
      ]);
      assert.deepEqual(status(out), [
        "applied",
        "duplicate",
        "rejected:id_conflict",
        "duplicate",
        "rejected:insufficient_funds",
        "applied",
      ]);
      assert.deepEqual(out.balances, { a: "6.00" });
    },
  ],
  [
    "invalid operations",
    async ({ cli }) => {
      const out = await run(cli, [
        dep("1", "a", "10"),
        dep("2", "a", "0"),
        dep("3", "a", "1.234"),
        dep("4", "a", "-1"),
        dep("5", "A", "1"),
        dep("6", "a", 1),
        dep("", "a", "1"),
        { id: "7", type: "refund", account: "a", amount: "1" },
        { id: "8", type: "deposit", account: "a", amount: "1", note: "x" },
        { id: "9", type: "transfer", account: "a", amount: "1" },
        dep("10", "a", "1000000000.01"),
        dep("11", "a", "1000000000.00"),
        null,
        [],
        { type: "deposit", account: "a", amount: "1" },
      ]);
      const invalid = "rejected:invalid";
      assert.deepEqual(status(out), ["applied", ...Array(10).fill(invalid), "applied", ...Array(3).fill(invalid)]);
      assert.equal(out.history[1].id, "2");
      assert.equal(out.history[6].id, "");
      assert.equal(out.history[12].id, null);
      assert.equal(out.history[14].id, null);
      assert.deepEqual(out.balances, { a: "1000000010.00" });
    },
  ],
  [
    "total balance is conserved across many transfers",
    async ({ cli }) => {
      const ops = [dep("d1", "a", "100"), dep("d2", "b", "50.50"), dep("d3", "c", "0.01")];
      const names = ["a", "b", "c"];
      for (let i = 0; i < 60; i++)
        ops.push(tr(`t${i}`, names[i % 3], names[(i + 1) % 3], `${(i % 7) * 13}.${String((i * 7) % 100).padStart(2, "0")}`));
      const out = await run(cli, ops);
      const total = Object.values(out.balances).reduce((sum, value) => sum + Math.round(Number(value) * 100), 0);
      assert.equal(total, 15051);
      for (const value of Object.values(out.balances)) assert.match(value, /^\d+\.\d\d$/);
      assert.ok(status(out).includes("rejected:insufficient_funds"));
      assert.ok(status(out).filter((entry) => entry === "applied").length > 20);
    },
  ],
  [
    "invalid roots and empty input",
    async ({ cli }) => {
      assert.deepEqual(await run(cli, []), { balances: {}, history: [] });
      for (const input of ["{", "{}", "null", ""]) {
        const result = await cli(input);
        assert.notEqual(result.code, 0);
        assert.equal(result.stdout, "");
        assert.ok(result.stderr.trim());
      }
    },
  ],
]);
