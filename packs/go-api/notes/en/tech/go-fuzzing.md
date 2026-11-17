---
type: "tech"
kind: "tool"
title: "Go fuzzing"
layer: "testing"
language: "go"
use_when: ["Go parsers tested with generated inputs","Go functions with deterministic invariants and seed cases"]
avoid_when: ["Tests require uncontrolled external services","A formal proof is required"]
performs_best: ["Coverage-guided Go input exploration and regression seeds"]
related: ["go","go-test","httptest"]
practices: ["go-errors","go-concurrency"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","go-fuzzing"]
---

# Go fuzzing

Go fuzzing explores inputs through testing fuzz targets. Keep targets deterministic, bounded and independent of shared services; preserve failing inputs as regressions. Normal go test runs seed cases, while a fuzz campaign requires an explicit fuzz invocation and time budget.

Related notes: [[go]], [[go-test]], [[httptest]].

[Official reference](https://go.dev/doc/security/fuzz/).
