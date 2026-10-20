import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { activityPath, appendActivity, readActivity } from "../src/index.js";

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "basics-activity-"));
}

test("appends events and reads them newest first", () => {
  const root = tempDir();
  appendActivity(root, { agent: "a", tool: "first", noteIds: ["one"] });
  appendActivity(root, { agent: "a", tool: "second", noteIds: ["two"] });
  appendActivity(root, { agent: "b", tool: "third", noteIds: ["three"] });

  const activity = readActivity(root);
  assert.deepEqual(
    activity.map((ev) => ev.tool),
    ["third", "second", "first"],
  );
  assert.match(activity[0].ts, /^\d{4}-\d{2}-\d{2}T/);
});

test("filters by note id", () => {
  const root = tempDir();
  appendActivity(root, { agent: "a", tool: "one", noteIds: ["a"] });
  appendActivity(root, { agent: "a", tool: "two", noteIds: ["b"] });
  appendActivity(root, { agent: "a", tool: "both", noteIds: ["a", "b"] });

  const activity = readActivity(root, { noteId: "a" });
  assert.deepEqual(
    activity.map((ev) => ev.tool),
    ["both", "one"],
  );
});

test("creates the .basics folder with a gitignore", () => {
  const root = tempDir();
  appendActivity(root, { agent: "a", tool: "one", noteIds: [] });

  const gitignore = path.join(root, ".basics", ".gitignore");
  assert.equal(fs.readFileSync(gitignore, "utf8").trim(), "*");
  assert.ok(fs.existsSync(activityPath(root)));
});

test("trims to the newest 1000 lines when the log exceeds 512 KB", () => {
  const root = tempDir();
  const file = activityPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const detail = "x".repeat(600);
  const lines = Array.from({ length: 1100 }, (_, i) =>
    JSON.stringify({ ts: new Date().toISOString(), agent: "a", tool: `tool-${i}`, noteIds: [], detail }),
  );
  fs.writeFileSync(file, `${lines.join("\n")}\n`);
  appendActivity(root, { agent: "a", tool: "last", noteIds: [] });

  const kept = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
  assert.equal(kept.length, 1000);
  assert.equal((JSON.parse(kept[kept.length - 1]) as { tool: string }).tool, "last");
});

test("skips malformed lines", () => {
  const root = tempDir();
  appendActivity(root, { agent: "a", tool: "valid", noteIds: [] });
  fs.appendFileSync(activityPath(root), "not json\n");
  appendActivity(root, { agent: "a", tool: "newest", noteIds: [] });

  const activity = readActivity(root);
  assert.deepEqual(
    activity.map((ev) => ev.tool),
    ["newest", "valid"],
  );
});
