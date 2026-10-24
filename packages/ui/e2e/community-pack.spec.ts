import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { buildTarGz } from "../../core/test/tar-builder.js";

// ---------------------------------------------------------------------------
// This spec never touches the network. The "GitHub" source is a local HTTP
// server (see packArchiveBase / BASICS_PACK_FETCH_BASE in core packs.ts): the
// CLI UI server is pointed at it with BASICS_PACK_FETCH_BASE, and the stub
// returns a canned tar.gz fixture for the known repo, 404 otherwise.
// ---------------------------------------------------------------------------

const PORT = 4814;
const STUB_PORT = 4815;
const STATE_FILE = ".vault-path-community";
const HERE = import.meta.dirname;

test.use({ baseURL: `http://127.0.0.1:${PORT}` });

const ARCHIVE = buildTarGz([
  { path: "cool-pack", type: "dir" },
  {
    path: "cool-pack/pack.json",
    data: JSON.stringify({
      name: "marcozvd/cool-pack",
      version: "1.0.0",
      description: { en: "A test community pack", es: "Un pack comunitario de prueba" },
      languages: ["en"],
      requires: [],
    }),
  },
  {
    path: "cool-pack/notes/en/tech/apples.md",
    data: [
      "---",
      "type: tech",
      "kind: framework",
      "title: Apples",
      "layer: backend",
      "tags: [fruit]",
      "---",
      "# Apples",
      "",
      "Community note.",
      "",
    ].join("\n"),
  },
  {
    path: "cool-pack/notes/en/practices/oranges.md",
    data: [
      "---",
      "type: practice",
      "kind: guideline",
      "title: Oranges",
      "layer: backend",
      "tags: [fruit]",
      "---",
      "# Oranges",
      "",
      "Community practice.",
      "",
    ].join("\n"),
  },
  { path: "cool-pack/README.md", data: "Ignored by the extractor.\n" },
]);

let server: ChildProcess | undefined;
let stub: Server | undefined;

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
  throw new Error("community pack e2e server did not start");
}

test.beforeAll(async () => {
  // Local "GitHub" source: serve the canned archive at codeload's URL shape.
  stub = createServer((req, res) => {
    const url = req.url ?? "";
    if (url.includes("/marcozvd/cool-pack/tar.gz/")) {
      res.writeHead(200, { "content-type": "application/gzip", "content-length": ARCHIVE.length });
      res.end(ARCHIVE);
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  });
  await new Promise<void>((resolve) => stub!.listen(STUB_PORT, "127.0.0.1", resolve));

  server = spawn(process.execPath, ["e2e/serve.mjs"], {
    cwd: path.resolve(HERE, ".."),
    env: {
      ...process.env,
      BASICS_E2E_EMPTY: "1",
      BASICS_E2E_PORT: String(PORT),
      BASICS_E2E_STATE: STATE_FILE,
      BASICS_PACK_FETCH_BASE: `http://127.0.0.1:${STUB_PORT}`,
    },
    stdio: "ignore",
  });
  await waitForHealth();
});

test.afterAll(async () => {
  const child = server;
  if (child && child.exitCode === null) {
    await new Promise<void>((resolve) => {
      child.once("exit", () => resolve());
      child.kill();
    });
  }
  const s = stub;
  if (s) await new Promise<void>((resolve) => s.close(() => resolve()));
  fs.rmSync(path.join(HERE, STATE_FILE), { force: true });
});

test("adds a pack from GitHub, reviews proposals in the inbox and approves all", async ({ page }) => {
  await page.goto("/");

  // The Add-from-GitHub input is part of the packs grid on an empty vault.
  const input = page.getByTestId("pack-add-repo");
  await expect(input).toBeVisible();
  await input.fill("marcozvd/cool-pack");
  await input.press("Enter");

  // Result summary with the pack name/version and per-kind counts.
  const result = page.getByTestId("pack-add-result");
  await expect(result).toContainText("marcozvd/cool-pack v1.0.0");
  await expect(result).toContainText("2 new, 0 changed, 0 unchanged, 0 invalid");

  // The community pack card now shows a GitHub marker and a Review-in-Inbox link,
  // which links to the inbox filtered by the pack.
  const card = page.locator('[data-pack="marcozvd/cool-pack"]');
  await expect(card).toBeVisible();
  await expect(card).toContainText("github");
  await card.getByRole("link", { name: "Review in Inbox" }).click();
  await expect(page).toHaveURL(/\/inbox\?pack=marcozvd%2Fcool-pack|marcozvd\/cool-pack/);

  // The pack filter narrows the inbox to that pack's proposals.
  await expect(page.getByRole("button", { name: /Apples/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Oranges/i })).toBeVisible();
  await expect(page.locator('[data-pack="marcozvd/cool-pack"]')).toContainText("2 updates");

  // Approve all installs them as pack-owned notes: first click arms the confirm.
  const packBar = page.locator('[data-pack="marcozvd/cool-pack"]');
  await packBar.getByRole("button", { name: "Approve all" }).click();
  await expect(packBar.getByRole("button", { name: "Confirm approve all?" })).toBeVisible();
  await packBar.getByRole("button", { name: "Confirm approve all?" }).click();
  await expect(page.getByText("Approved 2 proposals")).toBeVisible();
  await expect(page.getByText("Inbox zero — agents' proposals will show up here.")).toBeVisible();

  // The notes are installed and owned by the pack.
  const packs = (await (await page.request.get("/api/packs")).json()) as {
    repo?: string;
    installed: string | null;
    origin: string;
  }[];
  const community = packs.find((pack) => pack.repo === "marcozvd/cool-pack");
  expect(community?.origin).toBe("github");
  expect(community?.installed).toBe("1.0.0");
});
