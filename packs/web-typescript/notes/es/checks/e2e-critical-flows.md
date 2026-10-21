---
type: check
title: Flujos críticos E2E
kind: test
applies_to: [playwright, react, nextjs]
command: npx playwright test
---
Cada flujo crítico (registro, login, acción principal del producto) tiene un test E2E que pasa en Chromium y Firefox.
Usar selectores por rol (`getByRole`), no por clases CSS.
