import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Vault } from "../packages/core/dist/index.js";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const EVAL_STACK = ["react", "typescript", "playwright"];
export const PROJECT_ID = "role-eval-dashboard";
export const CHECKS = [
  { note: "typescript-typecheck", command: "npx tsc --noEmit" },
  { note: "e2e-critical-flows", command: "npx playwright test" },
];
export const SENTINEL = "# User rules\nKeep this user text.\n";

/**
 * The recommender returns keyword or hybrid results depending on the user's config.
 * Deterministic contracts must not depend on the owner's machine, so pin the mode.
 */
export async function withDeterministicConfig(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "basics-agent-roles-config-"));
  const file = path.join(dir, "config.json");
  fs.writeFileSync(file, `${JSON.stringify({ embeddings: false })}\n`);
  const previous = process.env.BASICS_CONFIG;
  process.env.BASICS_CONFIG = file;
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.BASICS_CONFIG;
    else process.env.BASICS_CONFIG = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
export const SCENARIO =
  "A team is fixing a dashboard counter. The accepted project is role-eval-dashboard. " +
  "The owner has approved react, typescript and playwright; do not choose a new stack. " +
  "The counter must increment exactly once per click, remain keyboard accessible, and pass the vault's applicable TypeScript and E2E checks. " +
  "Preserve all existing agent-file text. Use Basics according to your assigned role. Inbox proposals are authorised; approving proposals is not.";

export function acceptedNotes(vault) {
  return Object.fromEntries([...Vault.load(vault).notes.values()].map((note) => [note.id, fs.readFileSync(note.path, "utf8")]));
}

export function checkContract(project) {
  return Object.fromEntries(
    ["tests/counter.spec.ts", "playwright.config.ts", "tsconfig.json"].map((file) => [
      file,
      fs.readFileSync(path.join(project, file), "utf8"),
    ]),
  );
}

/** Source and test/config contracts, excluding reports and the runner's changing check wrapper. */
export function projectCode(project) {
  const result = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", "test-results", "playwright-report", ".git"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:tsx?|jsx?|mjs|html|json)$/.test(entry.name) && entry.name !== "eval-check.mjs")
        result[path.relative(project, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
    }
  };
  walk(project);
  return result;
}

export function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "basics-agent-roles-"));
  const vault = path.join(root, "vault");
  const project = path.join(root, "project");
  fs.cpSync(path.join(REPO, "examples/vault"), vault, { recursive: true });
  fs.mkdirSync(path.join(project, "src"), { recursive: true });
  const write = (file, content) => fs.writeFileSync(path.join(project, file), content);
  Vault.load(vault).writeNote(
    PROJECT_ID,
    {
      type: "project",
      title: "Role eval dashboard",
      status: "active",
      path: "./project",
      stack: { frontend: ["react", "typescript"], testing: ["playwright"] },
      lessons: [],
      tags: [],
      source: "manual",
    },
    "Accepted harness project. Counter must increment once per click, including rapid clicks.",
  );
  write("AGENTS.md", SENTINEL);
  write("CLAUDE.md", SENTINEL);
  write("basics.json", `${JSON.stringify({ project: PROJECT_ID, stack: EVAL_STACK })}\n`);
  write("package.json", JSON.stringify({ name: "role-eval-dashboard", private: true, type: "module" }));
  write(
    "tsconfig.json",
    JSON.stringify({
      compilerOptions: {
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["src"],
    }),
  );
  write(
    "index.html",
    '<!doctype html><html lang="en"><title>Counter</title><div id="root"></div><script type="module" src="/src/counter.tsx"></script></html>',
  );
  write(
    "src/counter.tsx",
    `import { useState } from "react";
import { createRoot } from "react-dom/client";
function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setTimeout(() => setCount(count + 1), 0)}>Count: {count}</button>;
}
createRoot(document.getElementById("root")!).render(<Counter />);
`,
  );
  write(
    "playwright.config.ts",
    `import { defineConfig } from "@playwright/test";
export default defineConfig({ testDir: "./tests", reporter: "json", projects: [{ name: "chromium", use: { browserName: "chromium" } }, { name: "firefox", use: { browserName: "firefox" } }], use: { baseURL: process.env.ROLE_EVAL_URL ?? "http://127.0.0.1:4821" }, webServer: { command: "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port " + new URL(process.env.ROLE_EVAL_URL ?? "http://127.0.0.1:4821").port + " --strictPort", url: process.env.ROLE_EVAL_URL ?? "http://127.0.0.1:4821", reuseExistingServer: false } });
`,
  );
  fs.mkdirSync(path.join(project, "tests"));
  write(
    "tests/counter.spec.ts",
    `import { test, expect } from "@playwright/test";
test("clicks and keyboard increment once", async ({ page }) => {
  await page.goto("/");
  const button = page.getByRole("button");
  await button.click();
  await expect(button).toHaveText("Count: 1");
  await button.evaluate((element: HTMLElement) => { element.click(); element.click(); });
  await expect(button).toHaveText("Count: 3");
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(button).toHaveText("Count: 4");
});
`,
  );
  // No installs or dependency changes: the throwaway project uses this checkout's dependencies.
  fs.symlinkSync(path.join(REPO, "node_modules"), path.join(project, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  return {
    root,
    vault,
    project,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}
