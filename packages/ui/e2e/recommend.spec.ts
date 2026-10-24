import { expect, test } from "@playwright/test";

test("recommends fastapi and exports the project files", async ({ page }) => {
  await page.goto("/recommend");
  // The layer filter only renders once /api/layers resolves; submit needs those ids.
  await expect(page.getByRole("button", { name: "Backend", exact: true })).toBeVisible();

  await page.getByLabel("Describe the project", { exact: true }).fill("API REST para servir modelos de machine learning");
  await page.getByRole("button", { name: "Recommend", exact: true }).click();

  const backend = page.getByRole("heading", { name: "Backend", exact: true });
  await expect(backend).toBeVisible();
  await expect(backend.locator("..").getByRole("link").first()).toHaveText("fastapi");

  await page.getByRole("checkbox", { name: "Select fastapi", exact: true }).check();
  await page.getByRole("button", { name: "Export stack", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Export", exact: true })).toBeVisible();
  await expect(dialog).toContainText("FastAPI");
  await expect(dialog).toContainText("basics export --stack fastapi");

  await dialog.getByRole("tab", { name: "AGENTS.md", exact: true }).click();
  await expect(dialog).toContainText("<!-- basics:start -->");

  await dialog.getByRole("tab", { name: "Cursor", exact: true }).click();
  await expect(dialog).toContainText("alwaysApply: true");
});

test("recommend keeps its state across navigation and clears it", async ({ page }) => {
  await page.goto("/recommend");
  await expect(page.getByRole("button", { name: "Backend", exact: true })).toBeVisible();

  const description = "API REST para servir modelos de machine learning";
  await page.getByLabel("Describe the project", { exact: true }).fill(description);
  await page.getByRole("button", { name: "Recommend", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Backend", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Explore", exact: true }).click();
  await expect(page).toHaveURL(/\/explore/);
  await page.getByRole("link", { name: "Recommend", exact: true }).click();

  await expect(page.getByLabel("Describe the project", { exact: true })).toHaveValue(description);
  await expect(page.getByRole("heading", { name: "Backend", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByLabel("Describe the project", { exact: true })).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Backend", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear", exact: true })).toHaveCount(0);
});

test("an empty layer shows the quiet no-match line", async ({ page }) => {
  await page.goto("/recommend");
  await expect(page.getByRole("button", { name: "Backend", exact: true })).toBeVisible();

  // Only data + testing are asked for; this description has nothing to match in testing.
  for (const layer of ["Backend", "Frontend", "Infra"]) {
    await page.getByRole("button", { name: layer, exact: true }).click();
  }

  await page.getByLabel("Describe the project", { exact: true }).fill("Postgres para cobros y devoluciones que se confirman o se deshacen");
  await page.getByRole("button", { name: "Recommend", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Data", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Testing", exact: true })).toBeVisible();
  // Layers the user did not ask for are not rendered at all.
  await expect(page.getByRole("heading", { name: "Backend", exact: true })).toHaveCount(0);
  await expect(page.getByText("No match in your vault for this layer", { exact: true })).toBeVisible();
});

test("the semantic-matching action shows a clear error when the runtime is absent", async ({ page }) => {
  // The e2e server has no embeddings runtime; never let the click trigger a real download.
  await page.route("**/api/embeddings/enable", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "internal", message: "embeddings runtime unavailable" }),
    }),
  );

  await page.goto("/recommend");
  await expect(page.getByRole("button", { name: "Backend", exact: true })).toBeVisible();

  await page.getByLabel("Describe the project", { exact: true }).fill("API REST para servir modelos de machine learning");
  await page.getByRole("button", { name: "Recommend", exact: true }).click();

  await expect(page.getByText("Keywords", { exact: true })).toBeVisible();
  const enable = page.getByRole("button", { name: "Turn on semantic matching", exact: true });
  await expect(enable).toBeVisible();
  await enable.click();

  await expect(page.getByRole("alert")).toContainText("embeddings runtime unavailable");
  // The badge stays Keywords after a failed enable.
  await expect(page.getByText("Keywords", { exact: true })).toBeVisible();
});

test("creates a project from the recommendation and merges its stack on repeat", async ({ page }) => {
  const description = "API REST para servir modelos de machine learning";

  const recommendAndPick = async (techs: string[]) => {
    await page.goto("/recommend");
    const clear = page.getByRole("button", { name: "Clear", exact: true });
    if ((await clear.count()) > 0) await clear.click();
    await expect(page.getByRole("button", { name: "Backend", exact: true })).toBeVisible();
    await page.getByLabel("Describe the project", { exact: true }).fill(description);
    await page.getByRole("button", { name: "Recommend", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Backend", exact: true })).toBeVisible();
    for (const tech of techs) {
      await page.getByRole("checkbox", { name: `Select ${tech}`, exact: true }).check();
    }
  };

  await recommendAndPick(["fastapi"]);
  await page.getByRole("button", { name: "Create project", exact: true }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Create project", exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue(description);
  await expect(dialog.getByLabel("Stack Backend", { exact: true })).toBeVisible();
  await expect(dialog.getByText("fastapi", { exact: true })).toBeVisible();
  await expect(dialog.getByLabel("Reason", { exact: true })).toHaveValue(/keyword/i);

  await dialog.getByLabel("Title", { exact: true }).fill("Delta API");
  await expect(dialog.getByLabel("ID", { exact: true })).toHaveValue("delta-api");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page).toHaveURL(/\/projects\?p=delta-api$/);
  await expect(page.getByRole("heading", { name: "Delta API", exact: true })).toBeVisible();

  let response = await page.request.get("/api/notes/delta-api");
  let projectData = (await response.json()) as { data: { stack: Record<string, string[]> } };
  expect(projectData.data.stack).toEqual({ backend: ["fastapi"] });

  // Same title again, now with an extra tech selected → the dialog offers "Update its stack".
  await recommendAndPick(["fastapi", "pytest"]);
  await page.getByRole("button", { name: "Create project", exact: true }).click();

  const dialog2 = page.getByRole("dialog");
  await dialog2.getByLabel("Title", { exact: true }).fill("Delta API");
  await expect(dialog2.getByLabel("ID", { exact: true })).toHaveValue("delta-api");
  await dialog2.getByRole("button", { name: "Create", exact: true }).click();

  await expect(dialog2.getByText("A project with this id exists", { exact: true })).toBeVisible();
  await dialog2.getByRole("button", { name: "Update its stack", exact: true }).click();

  await expect(page).toHaveURL(/\/projects\?p=delta-api$/);
  response = await page.request.get("/api/notes/delta-api");
  projectData = (await response.json()) as { data: { stack: Record<string, string[]> } };
  expect(projectData.data.stack).toEqual({ backend: ["fastapi"], testing: ["pytest"] });
});
