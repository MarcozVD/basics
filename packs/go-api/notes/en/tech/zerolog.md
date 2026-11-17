---
type: "tech"
kind: "library"
title: "Zerolog"
layer: "backend"
language: "go"
use_when: ["Go applications preferring fluent structured log events","Go services emitting structured JSON logs"]
avoid_when: ["A slog.Handler implementation is the required API","Fluent event construction is unwanted"]
performs_best: ["Fluent Go log events with explicit fields"]
related: ["go","slog","zap"]
practices: ["go-errors","go-layout"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","zerolog"]
---

# Zerolog

Zerolog provides structured Go log events through a fluent API. Finish events deliberately, define common fields centrally and test log redaction. Do not treat a logger choice as a substitute for request metrics or tracing.

Related notes: [[go]], [[slog]], [[zap]].

[Official reference](https://github.com/rs/zerolog).
