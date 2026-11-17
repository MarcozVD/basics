---
type: "tech"
kind: "library"
title: "Chi"
layer: "backend"
language: "go"
use_when: ["Go routing with existing net/http handlers","Go API with composable subrouters and middleware"]
avoid_when: ["An ORM or request-binding system must be bundled","A nonstandard HTTP handler API is already required"]
performs_best: ["Composition around standard Go HTTP handlers"]
related: ["go","net-http","httptest","pgx"]
practices: ["go-context","go-layout","go-concurrency"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","chi"]
---

# Chi

Chi builds routing around the Go net/http interfaces. Keep middleware ordering explicit and pass request contexts into persistence calls. Binding, validation and database access remain separate choices.

Related notes: [[go]], [[net-http]], [[httptest]], [[pgx]].

[Official reference](https://github.com/go-chi/chi).
