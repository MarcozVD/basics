import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const run = async (cli, lines) => {
  const result = await cli(Array.isArray(lines) ? `${lines.join("\n")}\n` : lines);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.endsWith("\n"));
  return JSON.parse(result.stdout);
};
const ev = (ts, ms) => JSON.stringify({ ts, ms });
await runCases("cli", [
  [
    "window edges are half-open at 60 seconds",
    async ({ cli }) => {
      const out = await run(cli, [
        ev("2026-03-01T10:00:00Z", 1),
        ev("2026-03-01T10:00:59.999Z", 2),
        ev("2026-03-01T10:01:00Z", 3),
        ev("2026-03-01T09:59:59.999Z", 4),
      ]);
      assert.deepEqual(out.windows, [
        { start: "2026-03-01T09:59:00.000Z", count: 1, p50: 4, p95: 4 },
        { start: "2026-03-01T10:00:00.000Z", count: 2, p50: 1, p95: 2 },
        { start: "2026-03-01T10:01:00.000Z", count: 1, p50: 3, p95: 3 },
      ]);
    },
  ],
  [
    "offsets are converted to UTC instants",
    async ({ cli }) => {
      const out = await run(cli, [
        ev("2026-03-01T12:00:30+02:00", 10),
        ev("2026-03-01T10:00:45Z", 20),
        ev("2026-03-01T04:30:10-05:30", 30),
      ]);
      assert.deepEqual(out.windows, [{ start: "2026-03-01T10:00:00.000Z", count: 3, p50: 20, p95: 30 }]);
    },
  ],
  [
    "nearest-rank percentiles",
    async ({ cli }) => {
      const values = [15, 20, 35, 40, 50, 5, 1, 100, 60, 70];
      const out = await run(
        cli,
        values.map((ms, index) => ev(`2026-03-01T10:00:${String(index).padStart(2, "0")}Z`, ms)),
      );
      // sorted: 1 5 15 20 35 40 50 60 70 100 -> p50 rank 5 = 35, p95 rank ceil(9.5)=10 = 100
      assert.deepEqual(out.windows, [{ start: "2026-03-01T10:00:00.000Z", count: 10, p50: 35, p95: 100 }]);
      const odd = await run(
        cli,
        [3, 1, 2].map((ms, index) => ev(`2026-03-01T10:00:0${index}Z`, ms)),
      );
      // sorted 1 2 3 -> p50 rank ceil(1.5)=2 -> 2, p95 rank ceil(2.85)=3 -> 3
      assert.deepEqual(odd.windows[0], { start: "2026-03-01T10:00:00.000Z", count: 3, p50: 2, p95: 3 });
    },
  ],
  [
    "singleton, ties and fractional values",
    async ({ cli }) => {
      const out = await run(cli, [
        ev("2026-03-01T10:00:00Z", 7.5),
        ev("2026-03-01T10:05:00Z", 2),
        ev("2026-03-01T10:05:01Z", 2),
        ev("2026-03-01T10:05:02Z", 2),
      ]);
      assert.deepEqual(out.windows, [
        { start: "2026-03-01T10:00:00.000Z", count: 1, p50: 7.5, p95: 7.5 },
        { start: "2026-03-01T10:05:00.000Z", count: 3, p50: 2, p95: 2 },
      ]);
    },
  ],
  [
    "input order does not matter",
    async ({ cli }) => {
      const rows = [
        ev("2026-03-01T10:02:10Z", 9),
        ev("2026-03-01T10:00:10Z", 1),
        ev("2026-03-01T10:02:05Z", 3),
        ev("2026-03-01T10:00:20Z", 5),
      ];
      const a = await run(cli, rows),
        b = await run(cli, [...rows].reverse());
      assert.deepEqual(a, b);
      assert.deepEqual(
        a.windows.map((window) => window.start),
        ["2026-03-01T10:00:00.000Z", "2026-03-01T10:02:00.000Z"],
      );
    },
  ],
  [
    "rejected lines with physical numbering",
    async ({ cli }) => {
      const out = await run(cli, [
        ev("2026-03-01T10:00:00Z", 1),
        "",
        "not json",
        JSON.stringify({ ts: "2026-03-01T10:00:00", ms: 1 }),
        JSON.stringify({ ts: "yesterday", ms: 1 }),
        JSON.stringify({ ts: "2026-03-01T10:00:00Z", ms: -1 }),
        JSON.stringify({ ts: "2026-03-01T10:00:00Z", ms: "5" }),
        JSON.stringify({ ts: "2026-03-01T10:00:00Z" }),
        JSON.stringify({ ms: 1 }),
        "[1]",
        "null",
        ev("2026-03-01T10:00:30Z", 3),
      ]);
      assert.deepEqual(out.rejected, [3, 4, 5, 6, 7, 8, 9, 10, 11]);
      assert.deepEqual(out.windows, [{ start: "2026-03-01T10:00:00.000Z", count: 2, p50: 1, p95: 3 }]);
    },
  ],
  [
    "CRLF input and empty input",
    async ({ cli }) => {
      const out = await run(cli, `${ev("2026-03-01T10:00:00Z", 1)}\r\n${ev("2026-03-01T10:00:01Z", 2)}\r\n`);
      assert.equal(out.windows[0].count, 2);
      assert.deepEqual(await run(cli, ""), { windows: [], rejected: [] });
    },
  ],
]);
