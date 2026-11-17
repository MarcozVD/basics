---
type: "tech"
kind: "library"
title: "Zap"
layer: "backend"
language: "go"
use_when: ["Servicio Go que ya utiliza campos tipados de Zap","Logging Go con configuración explícita de encoder y salida"]
avoid_when: ["Se exige únicamente la interfaz slog estándar","No hace falta una dependencia externa de logging"]
performs_best: ["Logging Go estructurado configurable con campos tipados"]
related: ["go","slog","zerolog"]
practices: ["go-errors","go-layout"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","zap"]
---

# Zap

Zap ofrece logging Go estructurado con campos tipados y cores configurables. Centraliza salidas, revisa cierre y errores de la salida elegida y excluye secretos. Mide una carga real antes de afirmar mejoras de velocidad.

Notas relacionadas: [[go]], [[slog]], [[zerolog]].

[Referencia oficial](https://pkg.go.dev/go.uber.org/zap).
