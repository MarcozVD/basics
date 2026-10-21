---
type: check
title: Flujos críticos E2E
kind: test
applies_to: [playwright, react, nextjs]
command: npx playwright test
---
Cada flujo crítico (registro, login, acción principal del producto) tiene un test E2E que pasa en Chromium y Firefox.
Usar selectores por rol (`getByRole`), no por clases CSS.

Empieza con este smoke test:

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
