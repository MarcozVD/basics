---
type: "tech"
kind: "library"
title: "net/http"
layer: "backend"
language: "go"
use_when: ["Go HTTP API using standard handlers","Go service with explicit routing and JSON handling"]
avoid_when: ["A framework-specific handler context is mandatory","An integrated application framework is required"]
performs_best: ["Standard Go HTTP interfaces and middleware"]
related: ["go","chi","httptest","slog"]
practices: ["go-context","go-errors","go-concurrency"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","net-http"]
---

# net/http

net/http supplies Go HTTP servers, clients and handlers. Set server timeouts, limit request bodies, validate decoded input and use request contexts. Compose handlers rather than depending on global mutable state.

Related notes: [[go]], [[chi]], [[httptest]], [[slog]].

[Official reference](https://pkg.go.dev/net/http).
