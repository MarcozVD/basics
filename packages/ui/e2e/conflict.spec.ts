import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { vaultPath } from "./helpers";

test("shows a conflict when the file changes on disk while editing", async ({ page }) => {
  await page.goto("/notes/fastapi");

  const title = page.getByLabel("Title", { exact: true });
  await expect(title).toHaveValue("FastAPI");
  await title.fill("FastAPI (local edit)");

  fs.appendFileSync(path.join(vaultPath(), "tech", "fastapi.md"), "\n\nDisk edit for conflict test.\n");

  const banner = page.getByText("This note changed on disk.", { exact: true });
  await expect(banner).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Reload", exact: true }).click();
  await expect(banner).not.toBeVisible();
  await expect(title).toHaveValue("FastAPI");
});
