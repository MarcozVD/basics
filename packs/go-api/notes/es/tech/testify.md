---
type: "tech"
kind: "library"
title: "Testify"
layer: "testing"
language: "go"
use_when: ["Pruebas Go que prefieren helpers de aserciones","Casos Go con aserciones legibles de igualdad y errores"]
avoid_when: ["Solo se permite la biblioteca estándar de Go","Una biblioteca ocultaría unas pocas condiciones sencillas"]
performs_best: ["Aserciones Go sobre el paquete testing estándar"]
related: ["go","go-test","gomock"]
practices: ["go-layout","go-errors"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","testify"]
---

# Testify

Testify añade helpers Go de aserciones, requisitos y mocks. Elige cuándo detener la prueba y mantén legibles sus fallos. No intentes finalizar una prueba padre mediante aserciones desde una goroutine de trabajo.

Notas relacionadas: [[go]], [[go-test]], [[gomock]].

[Referencia oficial](https://github.com/stretchr/testify).
