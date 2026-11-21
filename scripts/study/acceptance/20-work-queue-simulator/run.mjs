import assert from "node:assert/strict";
import { runCases } from "./harness.mjs";

const job = (id, priority = 0, available_at = 0, duration = 1, fail_attempts = 0, max_attempts = 1) => ({
  id,
  priority,
  available_at,
  duration,
  fail_attempts,
  max_attempts,
});
const simulate = async (cli, jobs) => {
  const result = await cli(JSON.stringify(jobs));
  assert.equal(result.code, 0, result.stderr);
  assert.ok(result.stdout.endsWith("\n"));
  return JSON.parse(result.stdout);
};
const ev = (name, attempt, start, end, outcome = "success") => ({ job: name, attempt, start, end, outcome });
await runCases("cli", [
  [
    "higher priority first, ties by id",
    async ({ cli }) => {
      const out = await simulate(cli, [job("b", 1, 0, 2), job("a", 1, 0, 3), job("z", 5, 0, 1), job("c", -1, 0, 1)]);
      assert.deepEqual(out.events, [ev("z", 1, 0, 1), ev("a", 1, 1, 4), ev("b", 1, 4, 6), ev("c", 1, 6, 7)]);
      assert.deepEqual(out.final, { z: "finished", a: "finished", b: "finished", c: "finished" });
      assert.equal(out.end_time, 7);
    },
  ],
  [
    "tie order uses code units",
    async ({ cli }) => {
      const out = await simulate(cli, [job("b"), job("B"), job("10"), job("a")]);
      assert.deepEqual(
        out.events.map((event) => event.job),
        ["10", "B", "a", "b"],
      );
    },
  ],
  [
    "jobs not yet due: time jumps to the next availability",
    async ({ cli }) => {
      const out = await simulate(cli, [job("late", 9, 10, 2), job("early", 0, 3, 1)]);
      assert.deepEqual(out.events, [ev("early", 1, 3, 4), ev("late", 1, 10, 12)]);
      assert.equal(out.end_time, 12);
    },
  ],
  [
    "a job becoming ready during a run waits for it to end and then competes",
    async ({ cli }) => {
      const out = await simulate(cli, [job("long", 0, 0, 10), job("urgent", 100, 5, 1), job("normal", 1, 2, 1)]);
      assert.deepEqual(out.events, [ev("long", 1, 0, 10), ev("urgent", 1, 10, 11), ev("normal", 1, 11, 12)]);
    },
  ],
  [
    "failed attempts retry after 10 times the attempt number",
    async ({ cli }) => {
      const out = await simulate(cli, [job("r", 0, 0, 2, 2, 5)]);
      assert.deepEqual(out.events, [ev("r", 1, 0, 2, "fail"), ev("r", 2, 12, 14, "fail"), ev("r", 3, 34, 36)]);
      assert.deepEqual(out.final, { r: "finished" });
      assert.equal(out.end_time, 36);
    },
  ],
  [
    "retry exhaustion marks a job failed",
    async ({ cli }) => {
      const out = await simulate(cli, [job("x", 0, 0, 1, 9, 2), job("y", 0, 0, 1)]);
      assert.deepEqual(out.events, [ev("x", 1, 0, 1, "fail"), ev("y", 1, 1, 2), ev("x", 2, 11, 12, "fail")]);
      assert.deepEqual(out.final, { x: "failed", y: "finished" });
      assert.equal(out.end_time, 12);
    },
  ],
  [
    "other ready jobs run while a failed job waits",
    async ({ cli }) => {
      const out = await simulate(cli, [job("f", 5, 0, 1, 1, 3), job("g", 1, 0, 4), job("h", 1, 0, 4)]);
      assert.deepEqual(out.events, [ev("f", 1, 0, 1, "fail"), ev("g", 1, 1, 5), ev("h", 1, 5, 9), ev("f", 2, 11, 12)]);
      assert.deepEqual(out.final, { f: "finished", g: "finished", h: "finished" });
      assert.equal(out.end_time, 12);
    },
  ],
  [
    "max_attempts of one fails immediately and zero jobs end at zero",
    async ({ cli }) => {
      const out = await simulate(cli, [job("o", 0, 0, 3, 1, 1)]);
      assert.deepEqual(out, { events: [ev("o", 1, 0, 3, "fail")], final: { o: "failed" }, end_time: 3 });
      assert.deepEqual(await simulate(cli, []), { events: [], final: {}, end_time: 0 });
    },
  ],
  [
    "repeated simulation is deterministic",
    async ({ cli }) => {
      const jobs = [];
      for (let i = 0; i < 25; i++) jobs.push(job(`j${i}`, i % 4, (i * 3) % 11, 1 + (i % 3), i % 3, 1 + (i % 4)));
      const first = await cli(JSON.stringify(jobs)),
        second = await cli(JSON.stringify(jobs));
      assert.equal(first.code, 0, first.stderr);
      assert.equal(first.stdout, second.stdout);
      const out = JSON.parse(first.stdout);
      assert.equal(Object.keys(out.final).length, 25);
      for (let i = 1; i < out.events.length; i++) assert.ok(out.events[i].start >= out.events[i - 1].end);
    },
  ],
  [
    "invalid input",
    async ({ cli }) => {
      for (const input of [
        "{",
        "{}",
        JSON.stringify([job("a"), job("a")]),
        JSON.stringify([job("")]),
        JSON.stringify([{ ...job("a"), duration: 0 }]),
        JSON.stringify([{ ...job("a"), available_at: -1 }]),
        JSON.stringify([{ ...job("a"), max_attempts: 0 }]),
        JSON.stringify([{ ...job("a"), fail_attempts: 1.5 }]),
        JSON.stringify([{ ...job("a"), priority: "1" }]),
        JSON.stringify([{ ...job("a"), extra: 1 }]),
        JSON.stringify([{ id: "a" }]),
      ]) {
        const result = await cli(input);
        assert.notEqual(result.code, 0, input);
        assert.equal(result.stdout, "");
        assert.ok(result.stderr.trim());
      }
    },
  ],
]);
