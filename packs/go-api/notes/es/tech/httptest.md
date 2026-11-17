---
type: "tech"
kind: "library"
title: "net/http/httptest"
layer: "testing"
language: "go"
use_when: ["Handlers HTTP Go probados con recorders","Clientes HTTP Go probados con servidores locales de pruebas"]
avoid_when: ["Solo se dispone de handlers propios de un framework sin adaptador","Debe verificarse el contrato de un servicio remoto real"]
performs_best: ["Recorders Go de respuestas HTTP y servidores locales"]
related: ["go","net-http","chi","go-test"]
practices: ["go-context","go-layout","go-errors"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","httptest"]
---

# net/http/httptest

httptest proporciona recorders de respuestas y servidores locales HTTP Go. Usa recorders para handlers compatibles y servidores para clientes. Verifica estado, cabeceras y cuerpo, cierra servidores y prueba cancelación. Otros modelos de handler pueden necesitar adaptadores o APIs propias.

Notas relacionadas: [[go]], [[net-http]], [[chi]], [[go-test]].

[Referencia oficial](https://pkg.go.dev/net/http/httptest).
