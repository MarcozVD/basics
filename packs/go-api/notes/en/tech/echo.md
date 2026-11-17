---
type: "tech"
kind: "framework"
title: "Echo"
layer: "backend"
language: "go"
use_when: ["Go REST API with centralized HTTP error handling","Go handlers using a framework binding interface"]
avoid_when: ["Only standard handler signatures may cross application boundaries","The application does not need a web framework"]
performs_best: ["Go HTTP routing with framework middleware"]
related: ["go","net-http","httptest","slog"]
practices: ["go-errors","go-context","go-layout"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","echo"]
---

# Echo

Echo offers routing, middleware, binding and HTTP error handling for Go. Keep domain functions independent of its handler context. Review binding targets, configure error responses and propagate request cancellation.

Related notes: [[go]], [[net-http]], [[httptest]], [[slog]].

[Official reference](https://echo.labstack.com/guide/quickstart/).
