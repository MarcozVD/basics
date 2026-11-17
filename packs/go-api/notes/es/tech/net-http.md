---
type: "tech"
kind: "library"
title: "net/http"
layer: "backend"
language: "go"
use_when: ["API HTTP Go con handlers estándar","Servicio Go con rutas y manejo JSON explícitos"]
avoid_when: ["Se exige un contexto de handler propio de un framework","Se necesita un framework de aplicación integrado"]
performs_best: ["Interfaces HTTP y middleware estándar de Go"]
related: ["go","chi","httptest","slog"]
practices: ["go-context","go-errors","go-concurrency"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","net-http"]
---

# net/http

net/http proporciona servidores, clientes y handlers HTTP Go. Configura timeouts, limita cuerpos, valida entradas y utiliza el contexto de la petición. Compón handlers sin depender de estado global mutable.

Notas relacionadas: [[go]], [[chi]], [[httptest]], [[slog]].

[Referencia oficial](https://pkg.go.dev/net/http).
