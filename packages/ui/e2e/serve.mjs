import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// webServer starts before Playwright globalSetup, so this launcher owns the temp
// vault: copy examples/vault, write its path to e2e/.vault-path, then start the CLI.
const here = import.meta.dirname;
const repoRoot = path.resolve(here, "../../..");
const runDir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-e2e-"));
const vault = path.join(runDir, "vault");
const config = path.join(runDir, "config.json");
const empty = process.env.BASICS_E2E_EMPTY === "1";
const port = process.env.BASICS_E2E_PORT ?? "4810";
const stateFile = process.env.BASICS_E2E_STATE ?? ".vault-path";

if (empty) fs.mkdirSync(vault, { recursive: true });
else fs.cpSync(path.join(repoRoot, "examples", "vault"), vault, { recursive: true });
fs.writeFileSync(config, JSON.stringify({ language: "en" }));
fs.writeFileSync(path.join(here, stateFile), vault);
console.log(`[e2e] vault: ${vault}${empty ? " (empty)" : ""}`);

// A fake Claude Code CLI, never a real one: a node script that emits Claude's `stream-json` shape.
// It is placed first on the UI server's PATH so GET /api/agents detects it; a prompt containing
// BASICS_E2E_SLEEP keeps running so a spec can exercise Cancel.
const FAKE_AGENT = [
  "const args = process.argv.slice(2);",
  "const prompt = args[1] || '';",
  "function line(obj) { process.stdout.write(JSON.stringify(obj) + '\\n'); }",
  "if (prompt.includes('BASICS_E2E_SLEEP')) { setInterval(function () {}, 1000); }",
  "else {",
  "  const text = 'Decisión: backend: fastapi [[fastapi]].';",
  "  line({ type: 'assistant', message: { content: [{ type: 'text', text: text }] } });",
  "  line({ type: 'result', subtype: 'success', result: text });",
  "}",
].join("\n");

const binDir = path.join(runDir, "bin");
fs.mkdirSync(binDir, { recursive: true });
fs.writeFileSync(path.join(binDir, "claude-fake.cjs"), FAKE_AGENT);
if (process.platform === "win32") {
  fs.writeFileSync(path.join(binDir, "claude.cmd"), `@ECHO off\r\n"%~dp0\\node.exe" "%~dp0\\claude-fake.cjs" %*\r\n`);
} else {
  const shim = path.join(binDir, "claude");
  fs.writeFileSync(shim, `#!/bin/sh\nexec node "$(dirname "$0")/claude-fake.cjs" "$@"\n`);
  fs.chmodSync(shim, 0o755);
}

const cli = path.join(repoRoot, "packages", "basics", "dist", "cli.js");
const child = spawn(process.execPath, [cli, "--vault", vault, "ui", "--no-open", "--port", port], {
  stdio: "inherit",
  env: { ...process.env, BASICS_CONFIG: config, PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}` },
});

let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  fs.rmSync(runDir, { recursive: true, force: true });
  fs.rmSync(path.join(here, stateFile), { force: true });
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(`[e2e] could not start the CLI: ${error.message}`);
  cleanup();
  process.exit(1);
});

child.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
