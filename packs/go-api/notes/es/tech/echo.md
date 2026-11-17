---
type: "tech"
kind: "framework"
title: "Echo"
layer: "backend"
language: "go"
use_when: ["API REST Go con manejo central de errores HTTP","Handlers Go con una interfaz de binding del framework"]
avoid_when: ["Solo se permiten firmas estándar de handlers en los límites de la aplicación","La aplicación no necesita un framework web"]
performs_best: ["Rutas HTTP Go con middleware del framework"]
related: ["go","net-http","httptest","slog"]
practices: ["go-errors","go-context","go-layout"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","echo"]
---

# Echo

Echo ofrece rutas, middleware, binding y manejo de errores HTTP en Go. Mantén el dominio independiente del contexto del handler. Revisa destinos de binding, configura respuestas de error y propaga cancelación.

Notas relacionadas: [[go]], [[net-http]], [[httptest]], [[slog]].

[Referencia oficial](https://echo.labstack.com/guide/quickstart/).
