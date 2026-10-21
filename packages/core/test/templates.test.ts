import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";
import { checkTemplates, installPack, type Note, type NoteData, stackTemplates, Vault } from "../src/index.js";

const PACKS = path.resolve(import.meta.dirname, "../../../packs");

function check(body: string, id = "fastapi-endpoint-tests"): Note {
  const data: NoteData = { type: "check", kind: "test", applies_to: ["fastapi"], tags: [], source: "manual" };
  return { id, path: "", data, body, links: [], hash: "" };
}

test("checkTemplates reads file blocks and ignores plain code blocks", () => {
  const body = [
    "Intro",
    "",
    "```python file=tests/test_health.py",
    "from app.main import app",
    "```",
    "",
    "```bash",
    "pytest -q",
    "```",
    "",
    "~~~toml file=ruff.toml",
    "line-length = 100",
    "~~~",
  ].join("\n");

  assert.deepEqual(checkTemplates(check(body)), [
    { check: "fastapi-endpoint-tests", file: "tests/test_health.py", lang: "python", content: "from app.main import app" },
    { check: "fastapi-endpoint-tests", file: "ruff.toml", lang: "toml", content: "line-length = 100" },
  ]);
});

test("checkTemplates accepts info-string variants", () => {
  const body = [
    '```python  file="tests/quoted.py"',
    "quoted",
    "```",
    "```file=no-lang.py",
    "plain",
    "```",
    "```{python file=braced.py}",
    "braced",
    "```",
  ].join("\n");

  assert.deepEqual(checkTemplates(check(body)), [
    { check: "fastapi-endpoint-tests", file: "tests/quoted.py", lang: "python", content: "quoted" },
    { check: "fastapi-endpoint-tests", file: "no-lang.py", lang: "", content: "plain" },
    { check: "fastapi-endpoint-tests", file: "braced.py", lang: "python", content: "braced" },
  ]);
});

test("checkTemplates handles longer and tilde fences", () => {
  const body = ["````ts file=e2e/smoke.spec.ts", "```", "const x = 1;", "```", "````", "~~~~ file=a.txt", "tilde", "~~~~~"].join("\n");

  assert.deepEqual(checkTemplates(check(body)), [
    { check: "fastapi-endpoint-tests", file: "e2e/smoke.spec.ts", lang: "ts", content: "```\nconst x = 1;\n```" },
    { check: "fastapi-endpoint-tests", file: "a.txt", lang: "", content: "tilde" },
  ]);
});

test("checkTemplates skips unsafe file paths", () => {
  const unsafe = ["../evil.py", "/etc/passwd", "C:/temp/x.py", "tests\\x.py", "tests/../x.py", "~/x.py", ""];
  const body = unsafe.map((file) => `\`\`\`python file=${file}\nunsafe\n\`\`\``).join("\n");

  assert.deepEqual(checkTemplates(check(body)), []);
  assert.deepEqual(checkTemplates(check("```python file=./tests/ok.py\nok\n```")), [
    { check: "fastapi-endpoint-tests", file: "./tests/ok.py", lang: "python", content: "ok" },
  ]);
});

test("stackTemplates collects check templates and keeps the first file", () => {
  const vault = Vault.load(fs.mkdtempSync(path.join(os.tmpdir(), "basics-templates-")));
  const tech: NoteData = {
    type: "tech",
    kind: "framework",
    layer: "backend",
    checks: ["first-check", "second-check"],
    tags: [],
    source: "manual",
  };
  const first: NoteData = { type: "check", applies_to: [], tags: [], source: "manual" };
  vault.writeNote("fastapi", tech, "# FastAPI");
  vault.writeNote("first-check", first, "```python file=shared.py\nfirst\n```");
  vault.writeNote("second-check", first, "```python file=shared.py\nsecond\n```\n\n```toml file=ruff.toml\n[tool]\n```");

  assert.deepEqual(stackTemplates(vault, ["fastapi"]), [
    { check: "first-check", file: "shared.py", lang: "python", content: "first" },
    { check: "second-check", file: "ruff.toml", lang: "toml", content: "[tool]" },
  ]);
});

test("every official check ships the same single template in both languages", () => {
  const checks = (lang: "en" | "es"): Note[] => {
    const vault = Vault.load(fs.mkdtempSync(path.join(os.tmpdir(), `basics-pack-templates-${lang}-`)));
    installPack(vault, PACKS, "python-api", { lang });
    installPack(vault, PACKS, "web-typescript", { lang });
    assert.deepEqual(vault.issues, []);
    return vault.byType("check");
  };
  const en = checks("en");
  const es = checks("es");
  assert.equal(en.length, 4);
  assert.deepEqual(en.map((note) => note.id).sort(), es.map((note) => note.id).sort());

  for (const note of en) {
    const templates = checkTemplates(note);
    assert.equal(templates.length, 1, note.id);
    const other = es.find((candidate) => candidate.id === note.id);
    assert.ok(other, note.id);
    const [translated] = checkTemplates(other);
    assert.ok(translated);
    // Only prose comments are translated; code stays identical.
    const code = (content: string) =>
      content
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("#"))
        .join("\n");
    assert.equal(translated.file, templates[0].file);
    assert.equal(translated.lang, templates[0].lang);
    assert.equal(code(translated.content), code(templates[0].content));
  }
  assert.deepEqual(en.flatMap((note) => checkTemplates(note).map((template) => template.file)).sort(), [
    "e2e/smoke.spec.ts",
    "ruff.toml",
    "tests/test_health.py",
    "tsconfig.strict.json",
  ]);
});
