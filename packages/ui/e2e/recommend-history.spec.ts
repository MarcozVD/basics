import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { vaultPath } from "./helpers";

test.afterEach(async ({ request }) => {
  await request.put("/api/config", { data: { language: "en" } });
  await request.put("/api/vault-config/history", { data: { enabled: true } });
  await request.put("/api/vault-config/history", { data: { weight: 1 } });
  for (const lang of ["en", "es"]) {
    const file = path.join(vaultPath(), "projects", `history-ui-${lang}.md`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

for (const lang of ["en", "es"] as const) {
  test(`history switch persists with keyboard and project evidence opens in ${lang}`, async ({ page, request }) => {
    await request.put("/api/config", { data: { language: lang } });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: lang === "en" ? 1280 : 390, height: 900 });
    await page.addInitScript((theme) => localStorage.setItem("basics-theme", theme), lang === "en" ? "light" : "dark");
    await page.goto("/settings?section=search");
    const toggle = page.getByRole("switch", { name: lang === "en" ? "Use project history" : "Usar historial de proyectos", exact: true });
    const weight = page.getByRole("spinbutton", { name: lang === "en" ? "History strength" : "Intensidad del historial", exact: true });
    await expect(weight).toHaveValue("1");
    await weight.fill("4");
    await weight.press("Enter");
    await expect(weight).toHaveAttribute("aria-invalid", "true");
    expect((await (await request.get("/api/vault-config")).json()).history.weight).toBe(1);
    await weight.fill("2");
    await weight.press("Enter");
    await expect.poll(async () => (await (await request.get("/api/vault-config")).json()).history.weight).toBe(2);
    await expect(toggle).toBeEnabled();
    await expect(toggle).toBeChecked();
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).not.toBeChecked();
    await page.reload();
    await expect(toggle).not.toBeChecked();
    await expect(weight).toHaveValue("2");
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toBeChecked();

    const id = `history-ui-${lang}`;
    const created = await request.post("/api/notes", {
      data: {
        id,
        data: { type: "project", title: `Recorded ${lang} project`, status: "done", stack: { backend: ["fastapi"] } },
        body: "Accepted test evidence.",
      },
    });
    expect(created.status()).toBe(201);
    await page.goto("/recommend");
    await page.getByRole("textbox").first().fill("API REST");
    await page.getByRole("button", { name: lang === "en" ? "Recommend" : "Recomendar", exact: true }).click();
    const card = page.locator("details").filter({ has: page.locator(`a[href="/notes/${id}"]`) });
    await card.locator("summary").click();
    const project = card.getByRole("link", { name: `Recorded ${lang} project`, exact: true });
    await expect(project).toBeVisible();
    await project.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/notes/${id}$`));
  });
}
