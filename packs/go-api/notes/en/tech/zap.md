---
type: "tech"
kind: "library"
title: "Zap"
layer: "backend"
language: "go"
use_when: ["Go service already using Zap typed fields","Go logging with explicit encoder and output configuration"]
avoid_when: ["The standard slog interface alone is required","A third-party logging dependency is unnecessary"]
performs_best: ["Configurable structured Go logging with typed fields"]
related: ["go","slog","zerolog"]
practices: ["go-errors","go-layout"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","zap"]
---

# Zap

Zap offers structured Go logging with typed fields and configurable cores. Configure outputs centrally, review cleanup and error handling for the chosen output, and keep secrets out of fields. Measure a real workload before making speed claims.

Related notes: [[go]], [[slog]], [[zerolog]].

[Official reference](https://pkg.go.dev/go.uber.org/zap).
