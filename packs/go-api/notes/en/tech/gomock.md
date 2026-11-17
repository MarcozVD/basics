---
type: "tech"
kind: "library"
title: "GoMock (Uber)"
layer: "testing"
language: "go"
use_when: ["Go interface dependencies verified with generated mocks","Go tests needing explicit interaction expectations"]
avoid_when: ["A small handwritten fake expresses the behavior better","Real database or HTTP contract behavior is the subject"]
performs_best: ["Generated Go interface mocks and expectation checks"]
related: ["go","go-test","testify"]
practices: ["go-layout","go-errors"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","gomock"]
---

# GoMock (Uber)

Use the maintained Uber GoMock module for Go interface mocks. Pin the generator, regenerate when interfaces change and avoid asserting incidental call order. Mocks verify expectations, not the behavior of a real upstream system.

Related notes: [[go]], [[go-test]], [[testify]].

[Official reference](https://github.com/uber-go/mock).
