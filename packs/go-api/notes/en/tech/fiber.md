---
type: "tech"
kind: "framework"
title: "Fiber"
layer: "backend"
language: "go"
use_when: ["Go HTTP API preferring an Express-style routing interface","Go service choosing the fasthttp ecosystem"]
avoid_when: ["Direct net/http handler reuse without adapters is mandatory","Application code assumes standard request lifetimes everywhere"]
performs_best: ["Go routes and middleware using Fiber context"]
related: ["go","gin","echo","go-test"]
practices: ["go-context","go-errors","go-concurrency"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","fiber"]
---

# Fiber

Fiber is a Go framework built on fasthttp. Review adapter boundaries and the selected version's context and buffer-lifetime rules before retaining values or starting asynchronous work. Do not assume net/http APIs apply directly.

Related notes: [[go]], [[gin]], [[echo]], [[go-test]].

[Official reference](https://docs.gofiber.io/).
