---
type: "tech"
kind: "library"
title: "log/slog"
layer: "backend"
language: "go"
use_when: ["Go services needing structured logs from the standard library","Go applications sharing a handler-based logging interface"]
avoid_when: ["An existing third-party logger API must be kept","Only unstructured print statements are wanted"]
performs_best: ["Structured Go log records with replaceable handlers"]
related: ["go","net-http","zap","zerolog"]
practices: ["go-errors","go-context"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","slog"]
---

# log/slog

log/slog provides structured logging for Go. Choose output format and levels at startup, attach stable request fields and redact credentials and personal data. Logging a context does not automatically attach every context value.

Related notes: [[go]], [[net-http]], [[zap]], [[zerolog]].

[Official reference](https://pkg.go.dev/log/slog).
