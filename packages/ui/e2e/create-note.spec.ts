import { expect, test } from "@playwright/test";

test("creates a tech note from the dialog with kind and layers", async ({ page }) => {
  await page.goto("/explore");

  await page.getByRole("button", { name: "New note", exact: true }).click();
  const dialog = page.getByRole("dialog");

  const title = dialog.getByLabel("Title", { exact: true });
  await expect(title).toBeFocused();
  await title.fill("Drizzle ORM");
  await expect(dialog.getByLabel("ID", { exact: true })).toHaveValue("drizzle-orm");
  await expect(dialog.getByRole("tab", { name: "Tech", exact: true })).toHaveAttribute("aria-selected", "true");

  await dialog.getByRole("tab", { name: "Library", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Backend", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Data", exact: true }).click();
  await dialog.getByLabel("When would you use it?", { exact: true }).fill("Typed SQL with migrations");

  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page).toHaveURL(/\/notes\/drizzle-orm$/);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Drizzle ORM");
  await expect(page.getByText("TODO")).toHaveCount(0);

  const response = await page.request.get("/api/notes/drizzle-orm");
  expect(response.ok()).toBe(true);
  const note = (await response.json()) as {
    data: { kind: string; layer: string[]; use_when: string[] };
    body: string;
  };
  expect(note.data.kind).toBe("library");
  expect(note.data.layer).toEqual(expect.arrayContaining(["backend", "data"]));
  expect(note.data.use_when).toEqual(["Typed SQL with migrations"]);
  expect(note.body).not.toContain("TODO");
});

test("creates a practice with two techs and a rule line", async ({ page }) => {
  await page.goto("/explore");

  await page.getByRole("button", { name: "New note", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Strict request validation");
  await dialog.getByRole("tab", { name: "Practice", exact: true }).click();

  const appliesTo = dialog.getByLabel("Applies to", { exact: true });
  await appliesTo.fill("FastAPI");
  await page.getByRole("option", { name: "FastAPI fastapi", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(appliesTo).toBeFocused();

  await appliesTo.fill("React");
  await page.getByRole("option", { name: "React react", exact: true }).click();
  await dialog.getByLabel("The rule in one line", { exact: true }).fill("Validate request bodies with the shared schema");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page).toHaveURL(/\/notes\/strict-request-validation$/);
  const response = await page.request.get("/api/notes/strict-request-validation");
  expect(response.ok()).toBe(true);
  const note = (await response.json()) as { data: { applies_to: string[] }; body: string };
  expect(note.data.applies_to).toEqual(["fastapi", "react"]);
  expect(note.body).toContain("Validate request bodies with the shared schema");
});

test("creates a check with command", async ({ page }) => {
  await page.goto("/explore");

  await page.getByRole("button", { name: "New note", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Lint the UI");
  await dialog.getByRole("tab", { name: "Check", exact: true }).click();
  await dialog.getByRole("tab", { name: "Lint", exact: true }).click();

  const appliesTo = dialog.getByLabel("Applies to", { exact: true });
  await appliesTo.fill("React");
  await page.getByRole("option", { name: "React react", exact: true }).click();
  await dialog.getByLabel("Command", { exact: true }).fill("npm run lint");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  await expect(page).toHaveURL(/\/notes\/lint-the-ui$/);
  const response = await page.request.get("/api/notes/lint-the-ui");
  expect(response.ok()).toBe(true);
  const note = (await response.json()) as { data: { kind: string; applies_to: string[]; command: string } };
  expect(note.data.kind).toBe("lint");
  expect(note.data.applies_to).toEqual(["react"]);
  expect(note.data.command).toBe("npm run lint");
});

test("creates a note from a related field", async ({ page }) => {
  await page.goto("/notes/nextjs");

  const related = page.getByLabel("Related", { exact: true });
  await related.fill("Hono");
  const create = page.getByRole("option", { name: 'Create "Hono"' });
  await expect(create).toBeVisible();
  await create.click();

  await expect(page.getByText("Created Hono", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove hono" })).toBeVisible();
  await expect(related).toBeFocused();

  const response = await page.request.get("/api/notes/hono");
  expect(response.ok()).toBe(true);

  await page.keyboard.press("Control+s");
  await expect(page.getByText("Note saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/hono$/);
  await expect(page.getByPlaceholder("hono")).toHaveValue("Hono");
});
