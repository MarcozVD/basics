---
type: "tech"
kind: "library"
title: "log/slog"
layer: "backend"
language: "go"
use_when: ["Servicios Go que necesitan logs estructurados de la biblioteca estándar","Aplicaciones Go con una interfaz de logging basada en handlers"]
avoid_when: ["Debe conservarse la API de un logger externo existente","Solo se quieren impresiones de texto sin estructura"]
performs_best: ["Registros Go estructurados con handlers sustituibles"]
related: ["go","net-http","zap","zerolog"]
practices: ["go-errors","go-context"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","slog"]
---

# log/slog

log/slog aporta logging estructurado en Go. Elige formato y niveles al iniciar, adjunta campos estables de petición y oculta credenciales y datos personales. Pasar un contexto no adjunta automáticamente todos sus valores.

Notas relacionadas: [[go]], [[net-http]], [[zap]], [[zerolog]].

[Referencia oficial](https://pkg.go.dev/log/slog).
