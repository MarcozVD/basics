---
type: "tech"
kind: "library"
title: "Zerolog"
layer: "backend"
language: "go"
use_when: ["Aplicaciones Go que prefieren eventos de log con API fluida","Servicios Go que emiten logs JSON estructurados"]
avoid_when: ["La API exigida es una implementación slog.Handler","No se desea construir eventos con una API fluida"]
performs_best: ["Eventos de log Go con campos explícitos"]
related: ["go","slog","zap"]
practices: ["go-errors","go-layout"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","zerolog"]
---

# Zerolog

Zerolog proporciona eventos de log Go mediante una API fluida. Finaliza eventos explícitamente, centraliza campos comunes y prueba la ocultación de datos. Un logger no sustituye métricas ni trazas de peticiones.

Notas relacionadas: [[go]], [[slog]], [[zap]].

[Referencia oficial](https://github.com/rs/zerolog).
