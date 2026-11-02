import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { parseFrontmatter, Vault } from "../src/index.js";

// A payload that only flips a global flag: if gray-matter's JavaScript engine ran it,
// the flag turns true. Nothing else happens either way.
const FLAG = "__basicsFrontmatterEval";
const payload = (fence: string) =>
  `---${fence}\n(function () { globalThis.${FLAG} = true; return { type: "technology", name: "Evil" }; })()\n---\nbody\n`;

function flagged(): boolean {
  return (globalThis as Record<string, unknown>)[FLAG] === true;
}

test("parseFrontmatter refuses JavaScript and CoffeeScript fences without running them", () => {
  for (const fence of ["js", "javascript", "coffee", "coffeescript", "cson"]) {
    delete (globalThis as Record<string, unknown>)[FLAG];
    assert.throws(() => parseFrontmatter(payload(fence)), /not supported; use YAML/, fence);
    assert.equal(flagged(), false, `${fence} frontmatter must never be evaluated`);
  }
});

test("parseFrontmatter still reads YAML and JSON", () => {
  const yaml = parseFrontmatter("---\ntype: technology\nname: Hono\n---\nbody\n");
  assert.deepEqual(yaml.data, { type: "technology", name: "Hono" });
  assert.equal(yaml.content.trim(), "body");

  const json = parseFrontmatter('---json\n{ "type": "practice" }\n---\nx\n');
  assert.deepEqual(json.data, { type: "practice" });
});

test("a vault note with JavaScript frontmatter is reported, not executed", () => {
  delete (globalThis as Record<string, unknown>)[FLAG];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-fm-"));
  try {
    fs.mkdirSync(path.join(root, "technologies"), { recursive: true });
    fs.writeFileSync(path.join(root, "technologies", "evil.md"), payload("js"));
    const vault = Vault.load(root);
    assert.equal(flagged(), false);
    assert.ok(
      vault.issues.some((issue) => issue.path.endsWith("evil.md")),
      "the note shows up as an issue",
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
