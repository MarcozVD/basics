import { expect, test } from "@playwright/test";

test("serves the favicon and shows the brand mark in the top bar", async ({ page, request }) => {
  const favicon = await request.get("/favicon.svg");
  expect(favicon.status()).toBe(200);
  expect(favicon.headers()["content-type"]).toContain("image/svg+xml");

  await page.goto("/");

  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.svg");

  const brand = page.getByTestId("brand-logo");
  await expect(brand).toBeVisible();
  const logo = brand.locator("svg");
  await expect(logo).toHaveAttribute("width", "28");
  await expect(logo).toHaveAttribute("height", "28");
  // The mark is decorative; the "Basics" link next to it owns the accessible name.
  await expect(logo).toHaveAttribute("aria-hidden", "true");
});
