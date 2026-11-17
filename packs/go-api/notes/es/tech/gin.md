---
type: "tech"
kind: "framework"
title: "Gin"
layer: "backend"
language: "go"
use_when: ["API JSON Go con binding de peticiones","Servicio Go con grupos de rutas y middleware"]
avoid_when: ["Bastan funciones http.Handler estándar","No se desea un contexto de handler propio del framework"]
performs_best: ["Grupos de rutas Go y reglas explícitas de binding"]
related: ["go","net-http","httptest","gorm"]
practices: ["go-errors","go-context","go-layout"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","gin"]
---

# Gin

Gin aporta rutas, middleware y binding de peticiones Go. Acepta solo los campos permitidos y separa parsing de validación de negocio. Traduce errores a respuestas HTTP intencionales sin exponer detalles internos.

Notas relacionadas: [[go]], [[net-http]], [[httptest]], [[gorm]].

[Referencia oficial](https://gin-gonic.com/en/docs/).
