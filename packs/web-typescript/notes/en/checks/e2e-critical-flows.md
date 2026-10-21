---
type: check
title: Critical E2E flows
kind: test
applies_to: [playwright, react, nextjs]
command: npx playwright test
---
Every critical flow (sign-up, login, the product's main action) has an E2E test that passes in Chromium and Firefox.
Use role selectors (`getByRole`), not CSS classes.

Start with this smoke test:

```ts file=e2e/smoke.spec.ts
import { expect, test } from "@playwright/test";

test("home loads without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  const response = await page.goto("/");
  expect(response?.ok()).toBe(true);
  await expect(page.getByRole("main")).toBeVisible();
  expect(errors).toEqual([]);
});
```
