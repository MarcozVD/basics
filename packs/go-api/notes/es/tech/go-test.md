---
type: "tech"
kind: "tool"
title: "go test"
layer: "testing"
language: "go"
use_when: ["Suites Go unitarias y de integración del toolchain estándar","Pruebas de paquetes Go con casos en tablas"]
avoid_when: ["Se exige automatizar un navegador","La aplicación está escrita en Python o Rust","Se necesita vigilancia integrada de archivos y repetir pruebas al guardar"]
performs_best: ["Ejecución Go de pruebas de paquetes y ejemplos"]
related: ["go","httptest","testify","go-fuzzing"]
practices: ["go-layout","go-errors","go-concurrency"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","go-test"]
---

# go test

go test ejecuta pruebas de paquetes Go en una invocación; vigilar cambios continuamente requiere otras herramientas. Cubre éxito, rechazo, cancelación y fallos de persistencia; aísla recursos externos. Una suite vacía que pasa no cubre HTTP. Usa detección de carreras donde se admita y presupuesta campañas de fuzzing aparte.

Notas relacionadas: [[go]], [[httptest]], [[testify]], [[go-fuzzing]].

[Referencia oficial](https://pkg.go.dev/testing).
