---
type: tech
kind: framework
packages:
  npm: ["@playwright/test"]
  pypi: [playwright]
title: Playwright
layer: testing
language: typescript
use_when:
  - end-to-end tests for web applications in a browser
  - validating critical user flows such as login or checkout
avoid_when:
  - pure logic without a UI
performs_best:
  - multi-browser, auto-wait, traces for debugging
checks: [e2e-critical-flows]
tags: [e2e, browser, ui]
---
# Playwright

Browser E2E tests.
