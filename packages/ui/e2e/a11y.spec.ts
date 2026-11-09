import fs from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { vaultPath } from "./helpers";

/** Write a standalone note into the shared temp vault; returns a cleanup. */
function writeNote(folder: string, id: string, frontmatter: string, body: string): () => void {
  const file = path.join(vaultPath(), folder, `${id}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `---\n${frontmatter}\n---\n\n${body}\n`);
  return () => fs.rmSync(file, { force: true });
}

/** Write a pending create proposal; returns a cleanup. */
function writeProposal(id: string, title: string, agent: string): () => void {
  const file = path.join(vaultPath(), "inbox", `${id}.md`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    [
      "---",
      "type: tech",
      "kind: framework",
      `title: ${title}`,
      "layer: backend",
      "tags: []",
      "source: agent:e2e",
      "proposal:",
      "  action: create",
      `  proposed_by: ${agent}`,
      "  reason: accessibility test",
      `  created: "${new Date().toISOString()}"`,
      "---",
      `# ${title}`,
      "",
      "Pending proposal for the accessibility spec.",
      "",
    ].join("\n"),
  );
  return () => fs.rmSync(file, { force: true });
}

async function settle(page: Page) {
  await page.waitForFunction(() => document.querySelector("main h1") !== null);
}

test("the skip link is the first Tab stop, shows on focus and moves focus to main", async ({ page }) => {
  await page.goto("/");
  await settle(page);

  const skip = page.getByRole("link", { name: "Skip to content" });
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();

  // It waits above the viewport until focus; focused, its top edge is on screen.
  const box = await skip.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(0);

  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();
});

test("every route names itself in the tab, Inbox carries its pending count", async ({ page }) => {
  for (const [route, title] of [
    ["/", "Your stack memory"],
    ["/explore", "Explore"],
    ["/projects", "Projects"],
    ["/graph", "Graph"],
    ["/recommend", "Recommend"],
    ["/skills", "Skills"],
    ["/settings", "Settings"],
    ["/does-not-exist", "Page not found"],
  ]) {
    await page.goto(route);
    await expect(page).toHaveTitle(`${title} · Basics`);
  }

  // The note page takes the note's own title.
  await page.goto("/notes/typescript");
  await expect(page).toHaveTitle("TypeScript · Basics");

  const cleanup = writeProposal("a11y-title", "Accessibility title", "e2e");
  try {
    await page.goto("/inbox");
    await expect(page).toHaveTitle("Inbox (1) · Basics");
  } finally {
    cleanup();
  }
});

test("Spanish routes get Spanish tab titles", async ({ page }) => {
  await page.request.put("/api/config", { data: { language: "es" } });
  try {
    await page.goto("/");
    await expect(page).toHaveTitle("Tu memoria de stack · Basics");

    await page.goto("/explore");
    await expect(page).toHaveTitle("Explorar · Basics");

    await page.goto("/inbox");
    await expect(page).toHaveTitle("Bandeja · Basics");
  } finally {
    await page.request.put("/api/config", { data: { language: "en" } });
  }
});

test("each page has one h1 and the editor demotes its body headings", async ({ page }) => {
  for (const route of ["/", "/explore", "/projects", "/graph", "/inbox", "/recommend", "/skills", "/settings"]) {
    await page.goto(route);
    await settle(page);
    await expect(page.locator("main h1"), `h1 count on ${route}`).toHaveCount(1);
  }

  // The note body repeats the title as `#`; in the editor it renders below the one h1.
  await page.goto("/notes/typescript");
  await expect(page.locator("main h1")).toHaveCount(1);
  await expect(page.locator("main h2").filter({ hasText: /^TypeScript$/ })).toHaveCount(1);

  // Side sections sit under the h1, so their headings are h2 even at 11px.
  await page.getByRole("button", { name: /^Connections/ }).click();
  await expect(page.getByRole("heading", { name: /^Links \d+$/ })).toHaveJSProperty("tagName", "H2");
});

test("graph switches show their labels, not only an aria name", async ({ page }) => {
  await page.goto("/graph");
  await expect(page.getByTestId("graph-group")).toContainText("Group by layer");
  await expect(page.getByTestId("graph-broken")).toContainText("Broken links");
});

test("Esc clears search first and then moves focus to the list or canvas", async ({ page }) => {
  await page.goto("/explore");
  const search = page.locator('[data-page-header] input[type="search"]');
  await search.fill("fastapi");
  await search.press("Escape");
  await expect(search).toHaveValue("");
  await search.press("Escape");
  await expect(page.getByRole("listbox", { name: "Notes" })).toBeFocused();

  await page.goto("/graph");
  // The canvas is lazy: wait for its ref before the second Escape can focus it.
  await expect(page.getByTestId("graph-canvas")).toBeVisible();
  const graphSearch = page.getByTestId("graph-search");
  await graphSearch.fill("fastapi");
  await graphSearch.press("Escape");
  await expect(graphSearch).toHaveValue("");
  await graphSearch.press("Escape");
  await expect(page.getByTestId("graph-canvas")).toBeFocused();
});

test("home health counts carry an icon, not colour alone", async ({ page }) => {
  const cleanups = [
    writeNote("tech", "a11y-orphan", "type: tech\nkind: language\ntitle: A11y orphan\nlayer: backend", "# A11y orphan"),
    writeNote("tech", "a11y-broken", "type: tech\nkind: language\ntitle: A11y broken\nlayer: backend", "Broken [[a11y-missing-link]]."),
  ];
  try {
    await page.goto("/");
    await settle(page);
    await expect(page.locator('[data-stat="broken"] svg')).toHaveCount(1);
    await expect(page.locator('[data-stat="orphans"] svg')).toHaveCount(1);
  } finally {
    for (const cleanup of cleanups) cleanup();
  }
});
