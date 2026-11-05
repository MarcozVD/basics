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
const generated = Number.parseInt(process.env.BASICS_E2E_GENERATED ?? "0", 10);
/** Extra projects and inbox proposals for specs that exercise those list pages. */
const workload = Number.parseInt(process.env.BASICS_E2E_WORK ?? "0", 10);
const port = process.env.BASICS_E2E_PORT ?? "4810";
const stateFile = process.env.BASICS_E2E_STATE ?? ".vault-path";

/**
 * A big synthetic vault, for specs that need a graph where the force layout is slow:
 * techs cross-linked by `related` and `practices`, plus layers and profiles like a real
 * stack vault. `BASICS_E2E_GENERATED=600` writes 600 techs (~860 nodes once drawn).
 */
function writeLargeVault(dir, techs) {
  const practices = Math.max(1, Math.round(techs * 0.4));
  const layers = 12;
  const profiles = 8;
  const write = (folder, id, frontmatter, body) => {
    fs.mkdirSync(path.join(dir, folder), { recursive: true });
    fs.writeFileSync(path.join(dir, folder, `${id}.md`), `---\n${frontmatter}\n---\n\n${body}\n`);
  };
  for (let i = 0; i < layers; i++) {
    write("layers", `layer-${i}`, `type: layer\ntitle: Layer ${i}\ndescription: Synthetic layer ${i}`, `# Layer ${i}`);
  }
  for (let i = 0; i < techs; i++) {
    const related = [`tech-${(i + 1) % techs}`, `tech-${(i + 7) % techs}`];
    write(
      "tech",
      `tech-${i}`,
      [
        "type: tech",
        "kind: framework",
        `title: Tech ${i}`,
        `layer: layer-${i % layers}`,
        `related: [${related.join(", ")}]`,
        `practices: [practice-${i % practices}]`,
      ].join("\n"),
      `# Tech ${i}\n\nSynthetic tech for the graph layout specs.`,
    );
  }
  for (let i = 0; i < practices; i++) {
    write("practices", `practice-${i}`, `type: practice\ntitle: Practice ${i}\napplies_to: [tech-${(i * 5) % techs}]`, `- ${i}`);
  }
  for (let i = 0; i < profiles; i++) {
    const stack = Array.from({ length: layers }, (_, layer) => `  layer-${layer}: [tech-${(layer + i) % techs}]`).join("\n");
    write("profiles", `profile-${i}`, `type: profile\ntitle: Profile ${i}\nstack:\n${stack}`, `# Profile ${i}`);
  }
  // The list pages need content too: the generated stack has no projects or inbox proposals.
  for (let i = 0; i < workload; i++) {
    write(
      "projects",
      `project-${i}`,
      [
        "type: project",
        `title: Project ${i}`,
        `status: ${i % 5 === 0 ? "done" : "active"}`,
        "reason: Synthetic project for the page budget specs.",
        "lessons: []",
      ].join("\n"),
      `# Project ${i}`,
    );
    write(
      "inbox",
      `proposal-${i}`,
      [
        "type: layer",
        `title: Proposed layer ${i}`,
        "proposal:",
        "  action: create",
        "  proposed_by: agent-e2e",
        "  reason: Synthetic proposal for the page budget specs.",
        '  created: "2026-01-01T00:00:00.000Z"',
      ].join("\n"),
      `# Proposed layer ${i}`,
    );
  }
}

if (empty) fs.mkdirSync(vault, { recursive: true });
else if (generated > 0) writeLargeVault(vault, generated);
else fs.cpSync(path.join(repoRoot, "examples", "vault"), vault, { recursive: true });
fs.writeFileSync(config, JSON.stringify({ language: "en" }));
fs.writeFileSync(path.join(here, stateFile), vault);

// A throwaway home directory: connecting an agent from Settings writes real config files, and a
// test must never touch the person's own. Creating `.cursor/` makes Cursor show up as detected,
// so the specs can connect and disconnect it without depending on anything installed.
const home = path.join(runDir, "home");
// Claude Desktop resolves its config from `%APPDATA%` on Windows, not from the home directory.
const appData = path.join(home, "AppData", "Roaming");
fs.mkdirSync(path.join(home, ".cursor"), { recursive: true });
fs.mkdirSync(appData, { recursive: true });

// Skills for the Skills page: a few agent folders with one or two skills each, the same skill
// installed for two agents (it must merge into one row), a plugin skill and the shared store.
// Basics only reads these files; the page's area override writes to the temp config, never here.
function writeSkill(dir, frontmatter, body) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n\n${body}\n`);
}

const FRONTEND_DESIGN = [
  "name: frontend-design",
  "description: Landing pages and app screens with a strong point of view, from type to motion.",
  "version: 1.2.0",
  "category: design",
].join("\n");
const frontendBody = "# Frontend design\n\nUse when building or reviewing a public page.";
writeSkill(path.join(home, ".claude", "skills", "frontend-design"), FRONTEND_DESIGN, frontendBody);
// Same name and same content in the shared store: one row that lists Claude Code and Shared.
writeSkill(path.join(home, ".agents", "skills", "frontend-design"), FRONTEND_DESIGN, frontendBody);

writeSkill(
  path.join(home, ".config", "opencode", "skills", "security-audit"),
  'name: security-audit\ndescription: "Security review for APIs and web apps: threat models, OWASP checks and dependency audits."',
  "# Security audit\n\nUse before shipping anything that takes user input.",
);
writeSkill(
  path.join(home, ".codex", "skills", "playwright-cli"),
  "name: playwright-cli\ndescription: Drive a real browser with Playwright to write and run end-to-end tests.",
  "# Playwright CLI\n\nUse when a change needs proof in a browser.",
);
writeSkill(
  path.join(home, ".agents", "skills", "caveman-tools"),
  "name: caveman-tools\ndescription: Compress memory files so an agent spends fewer tokens. Workflow helpers for plans and commits.",
  "# Caveman tools\n\nUse when the token bill matters.",
);
// A plugin installed for the user: `installPath/skills` is scanned and the row carries the name.
const pluginRoot = path.join(home, ".claude", "plugins", "cache", "acme");
writeSkill(
  path.join(pluginRoot, "skills", "acme-docs"),
  'name: acme-docs\ndescription: "Documentation for the Acme API: endpoints, errors and examples."',
  "# Acme docs\n\nUse when answering questions about the Acme API.",
);
fs.mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
fs.writeFileSync(
  path.join(home, ".claude", "plugins", "installed_plugins.json"),
  JSON.stringify({ plugins: { "acme@marketplace": [{ scope: "user", installPath: pluginRoot }] } }, null, 2),
);

console.log(`[e2e] vault: ${vault}${empty ? " (empty)" : generated > 0 ? ` (generated, ${generated} techs)` : ""}`);
console.log(`[e2e] home: ${home}`);

// A fake Claude Code CLI, never a real one: a node script that emits Claude's `stream-json` shape.
// It is placed first on the UI server's PATH so GET /api/agents detects it. A prompt containing
// BASICS_E2E_SLEEP keeps running so a spec can exercise Cancel; BASICS_E2E_SLOW answers after a
// short delay, so a run can be left and finish while the user is on another page.
const FAKE_AGENT = [
  "const args = process.argv.slice(2);",
  "const prompt = args[1] || '';",
  "function line(obj) { process.stdout.write(JSON.stringify(obj) + '\\n'); }",
  "if (prompt.includes('BASICS_E2E_SLEEP')) { setInterval(function () {}, 1000); }",
  "else {",
  "  const text = 'Decisión: backend: fastapi [[fastapi]].';",
  "  const emit = function () {",
  "    line({ type: 'assistant', message: { content: [{ type: 'text', text: text }] } });",
  "    line({ type: 'result', subtype: 'success', result: text });",
  "  };",
  "  if (prompt.includes('BASICS_E2E_SLOW')) { setTimeout(emit, 1500); } else { emit(); }",
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
  env: {
    ...process.env,
    BASICS_CONFIG: config,
    // `os.homedir()` reads USERPROFILE on Windows and HOME elsewhere; Claude Desktop reads APPDATA.
    HOME: home,
    USERPROFILE: home,
    APPDATA: appData,
    PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`,
  },
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
