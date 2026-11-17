---
type: "tech"
kind: "tool"
title: "Go fuzzing"
layer: "testing"
language: "go"
use_when: ["Parsers Go probados con entradas generadas","Funciones Go con invariantes deterministas y semillas"]
avoid_when: ["Las pruebas requieren servicios externos sin controlar","Se exige una demostración formal"]
performs_best: ["Exploración Go de entradas guiada por cobertura y semillas"]
related: ["go","go-test","httptest"]
practices: ["go-errors","go-concurrency"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","go-fuzzing"]
---

# Go fuzzing

El fuzzing Go explora entradas mediante targets de testing. Mantén targets deterministas, acotados y separados de servicios compartidos; conserva entradas fallidas como regresiones. go test normal ejecuta semillas; una campaña requiere invocación fuzz explícita y presupuesto de tiempo.

Notas relacionadas: [[go]], [[go-test]], [[httptest]].

[Referencia oficial](https://go.dev/doc/security/fuzz/).
