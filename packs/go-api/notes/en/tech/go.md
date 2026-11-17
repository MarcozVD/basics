---
type: "tech"
kind: "language"
title: "Go (Golang)"
layer: "backend"
language: "go"
use_when: ["Go HTTP services deployed as compiled programs","Go concurrent request processing with explicit cancellation"]
avoid_when: ["A Python or Rust runtime is mandatory","A browser UI is the main deliverable"]
performs_best: ["Compiled Go services with explicit error values"]
related: ["net-http","gin","chi","database-sql"]
practices: ["go-errors","go-layout","go-concurrency"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","golang"]
---

# Go (Golang)

Go combines compiled programs with goroutines and channels. Keep error handling and resource limits explicit; concurrency does not remove the need for race tests or careful ownership.

Related notes: [[net-http]], [[gin]], [[chi]], [[database-sql]].

[Official reference](https://go.dev/doc/effective_go).
