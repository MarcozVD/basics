import assert from "node:assert/strict";
import { test } from "vitest";
import { parsePosixProcesses, shutdownPosixGroup } from "../src/agent-posix-tree.js";

const errno = (code: string) => Object.assign(new Error(code), { code });
const group = 4242;

test("Darwin EPERM for a zombie-only process group confirms shutdown", async () => {
  const signals: [number, unknown][] = [];
  const result = await shutdownPosixGroup(group, {
    signal: (pid, signal) => {
      signals.push([pid, signal]);
      throw errno("EPERM");
    },
    snapshot: async () => " 101 101 Ss\n 4243 4242 Z+\n 4244 4242 Zs\n",
    timeoutMs: 0,
  });
  assert.deepEqual(result, { confirmed: true });
  assert.deepEqual(signals, [
    [-group, "SIGKILL"],
    [-group, 0],
  ]);
});

test("a successful kill-zero probe with only zombie members also confirms shutdown", async () => {
  assert.deepEqual(
    await shutdownPosixGroup(group, {
      signal: () => true,
      snapshot: async () => " 10 10 R\n 4243 4242 Z\n",
      timeoutMs: 0,
    }),
    { confirmed: true },
  );
});

test("a live group member blocks staging and reports PID, group and state", async () => {
  const result = await shutdownPosixGroup(group, {
    signal: () => {
      throw errno("EPERM");
    },
    snapshot: async () => " 4243 4242 S+\n 4244 4242 Z\n 8888 8888 R\n",
    timeoutMs: 0,
  });
  assert.equal(result.confirmed, false);
  assert.deepEqual(result.diagnostics?.processes, [{ pid: 4243, pgid: group, state: "S+" }]);
  assert.equal(result.diagnostics?.signal_error, "EPERM");
});

test("bounded retries wait for live members to terminate rather than their zombies to be reaped", async () => {
  let captures = 0;
  const result = await shutdownPosixGroup(group, {
    signal: () => true,
    snapshot: async () => (++captures === 1 ? " 4243 4242 R\n" : " 4243 4242 Z\n"),
    timeoutMs: 1000,
  });
  assert.deepEqual(result, { confirmed: true });
  assert.equal(captures, 2);
});

test("missing groups succeed; unavailable or malformed snapshots remain unconfirmed", async () => {
  const absent = await shutdownPosixGroup(group, {
    signal: () => {
      throw errno("ESRCH");
    },
    snapshot: async () => {
      throw new Error("must not query ps");
    },
  });
  assert.deepEqual(absent, { confirmed: true });
  assert.deepEqual(await shutdownPosixGroup(group, { signal: () => true, snapshot: async () => " 8888 8888 R\n", timeoutMs: 0 }), {
    confirmed: true,
  });
  for (const stdout of ["", "PID PGID STAT\n", "123 bad S\n", "123 4242 S command/path\n"]) {
    const result = await shutdownPosixGroup(group, { signal: () => true, snapshot: async () => stdout, timeoutMs: 0 });
    assert.equal(result.confirmed, false);
    assert.equal(result.diagnostics?.reason, "POSIX process snapshot unavailable");
  }
  const denied = await shutdownPosixGroup(group, {
    signal: () => true,
    snapshot: async () => {
      throw errno("EACCES");
    },
  });
  assert.equal(denied.diagnostics?.snapshot_error, "EACCES");
});

test("BSD/macOS and Linux ps spacing and state suffixes parse without headers or shell interpretation", () => {
  assert.deepEqual(parsePosixProcesses("  42    42 Ss\n\t43 42 R+\n 44 42 Zs+\n"), [
    { pid: 42, pgid: 42, state: "Ss" },
    { pid: 43, pgid: 42, state: "R+" },
    { pid: 44, pgid: 42, state: "Zs+" },
  ]);
});
