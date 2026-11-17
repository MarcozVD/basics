---
type: "tech"
kind: "language"
title: "Go (Golang)"
layer: "backend"
language: "go"
use_when: ["Servicios HTTP Go desplegados como programas compilados","Procesamiento concurrente Go con cancelación explícita"]
avoid_when: ["Se exige un runtime Python o Rust","La entrega principal es una interfaz de navegador"]
performs_best: ["Servicios Go compilados con errores explícitos"]
related: ["net-http","gin","chi","database-sql"]
practices: ["go-errors","go-layout","go-concurrency"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","golang"]
---

# Go (Golang)

Go combina programas compilados con goroutines y canales. Explicita los errores y límites de recursos; la concurrencia no elimina las pruebas de carreras ni el cuidado sobre quién modifica cada dato.

Notas relacionadas: [[net-http]], [[gin]], [[chi]], [[database-sql]].

[Referencia oficial](https://go.dev/doc/effective_go).
