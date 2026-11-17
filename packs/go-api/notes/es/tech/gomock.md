---
type: "tech"
kind: "library"
title: "GoMock (Uber)"
layer: "testing"
language: "go"
use_when: ["Dependencias Go de interfaces verificadas con mocks generados","Pruebas Go con expectativas explícitas de interacción"]
avoid_when: ["Un fake pequeño escrito a mano expresa mejor el comportamiento","Se quiere verificar una base real o un contrato HTTP real"]
performs_best: ["Mocks Go generados de interfaces y expectativas"]
related: ["go","go-test","testify"]
practices: ["go-layout","go-errors"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","gomock"]
---

# GoMock (Uber)

Usa el módulo GoMock de Uber para mocks de interfaces Go. Fija el generador, regenera al cambiar interfaces y evita exigir orden accidental de llamadas. Los mocks verifican expectativas, no el comportamiento de un sistema externo real.

Notas relacionadas: [[go]], [[go-test]], [[testify]].

[Referencia oficial](https://github.com/uber-go/mock).
