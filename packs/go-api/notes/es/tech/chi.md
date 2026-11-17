---
type: "tech"
kind: "library"
title: "Chi"
layer: "backend"
language: "go"
use_when: ["Rutas Go con handlers net/http existentes","API Go con subrouters y middleware componibles"]
avoid_when: ["Se exige un ORM o sistema de binding incluido","Ya se exige una API HTTP de handlers no estándar"]
performs_best: ["Composición de handlers HTTP estándar de Go"]
related: ["go","net-http","httptest","pgx"]
practices: ["go-context","go-layout","go-concurrency"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","chi"]
---

# Chi

Chi construye rutas sobre las interfaces net/http de Go. Explicita el orden del middleware y pasa contextos a persistencia. Binding, validación y acceso a datos siguen siendo decisiones separadas.

Notas relacionadas: [[go]], [[net-http]], [[httptest]], [[pgx]].

[Referencia oficial](https://github.com/go-chi/chi).
