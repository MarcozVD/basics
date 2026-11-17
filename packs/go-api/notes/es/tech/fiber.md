---
type: "tech"
kind: "framework"
title: "Fiber"
layer: "backend"
language: "go"
use_when: ["API HTTP Go que prefiere rutas de estilo Express","Servicio Go que elige el ecosistema fasthttp"]
avoid_when: ["Se exige reutilizar handlers net/http directamente sin adaptadores","El código presupone ciclos de vida de peticiones estándar en todas partes"]
performs_best: ["Rutas Go y middleware con contexto Fiber"]
related: ["go","gin","echo","go-test"]
practices: ["go-context","go-errors","go-concurrency"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","fiber"]
---

# Fiber

Fiber es un framework Go sobre fasthttp. Revisa adaptadores y las reglas de contexto y vida útil de buffers de la versión elegida antes de retener valores o iniciar trabajo asíncrono. No supongas equivalencia directa con net/http.

Notas relacionadas: [[go]], [[gin]], [[echo]], [[go-test]].

[Referencia oficial](https://docs.gofiber.io/).
