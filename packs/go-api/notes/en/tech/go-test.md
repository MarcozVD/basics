---
type: "tech"
kind: "tool"
title: "go test"
layer: "testing"
language: "go"
use_when: ["Go unit and integration suites in the standard toolchain","Go package tests with table-driven cases"]
avoid_when: ["A browser automation suite is required","The target application is written in Python or Rust","Built-in file watching and repeated runs on every save are required"]
performs_best: ["Go package-level test execution and examples"]
related: ["go","httptest","testify","go-fuzzing"]
practices: ["go-layout","go-errors","go-concurrency"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","go-test"]
---

# go test

go test runs Go package tests for one invocation; continuous file watching needs separate tooling. Include success, rejected input, cancellation and persistence failures; isolate external resources. A passing empty suite is not HTTP coverage. Use race detection where supported and budget separate fuzz campaigns.

Related notes: [[go]], [[httptest]], [[testify]], [[go-fuzzing]].

[Official reference](https://pkg.go.dev/testing).
