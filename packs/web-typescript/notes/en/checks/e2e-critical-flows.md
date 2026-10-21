---
type: check
title: Critical E2E flows
kind: test
applies_to: [playwright, react, nextjs]
command: npx playwright test
---
Every critical flow (sign-up, login, the product's main action) has an E2E test that passes in Chromium and Firefox.
Use role selectors (`getByRole`), not CSS classes.
