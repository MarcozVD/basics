import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const PORT = 4812;
const STATE_FILE = ".vault-path-onboarding";
const HERE = import.meta.dirname;

test.use({ baseURL: `http://127.0.0.1:${PORT}` });

let server: ChildProcess | undefined;

async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/api/health`);
      if (res.ok) return;
    } catch {
      // Server not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("onboarding e2e server did not start");
}

test.beforeAll(async () => {
  server = spawn(process.execPath, ["e2e/serve.mjs"], {
    cwd: path.resolve(HERE, ".."),
    env: { ...process.env, BASICS_E2E_EMPTY: "1", BASICS_E2E_PORT: String(PORT), BASICS_E2E_STATE: STATE_FILE },
    stdio: "ignore",
  });
  await waitForHealth();
});

test.afterAll(async () => {
  const child = server;
  if (!child || child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once("exit", () => resolve());
    child.kill();
  });
  fs.rmSync(path.join(HERE, STATE_FILE), { force: true });
});

test("an empty vault installs the starter packs and Home shows counts", async ({ page, request }) => {
  const packs = (await (await request.get("/api/packs")).json()) as { name: string; notes: number; version: string }[];
  expect(packs.length).toBeGreaterThan(0);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Start with a starter pack" })).toBeVisible();
  for (const pack of packs) {
    await expect(page.getByRole("checkbox", { name: pack.name, exact: true })).toBeChecked();
  }

  await page.getByRole("button", { name: `Install ${packs.length} packs` }).click();
  await expect(page.getByRole("heading", { name: "Start with a starter pack" })).toBeHidden();

  const stats = (await (await request.get("/api/stats")).json()) as { total: number; counts: Record<string, number> };
  expect(stats.total).toBeGreaterThan(0);
  expect(stats.counts.tech).toBeGreaterThan(0);
  await expect(page.locator('[data-stat="tech"]')).toContainText(String(stats.counts.tech));
  await expect(page.locator('[data-stat="practice"]')).toContainText(String(stats.counts.practice));

  await page.goto("/?packs=1");
  await expect(page.getByRole("heading", { name: "Start with a starter pack" })).toBeVisible();
  const first = page.getByRole("checkbox", { name: packs[0].name, exact: true });
  await expect(first).toBeDisabled();
  await expect(first).not.toBeChecked();
  await expect(page.getByText(`installed v${packs[0].version}`).first()).toBeVisible();
});
