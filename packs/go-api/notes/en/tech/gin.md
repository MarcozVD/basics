---
type: "tech"
kind: "framework"
title: "Gin"
layer: "backend"
language: "go"
use_when: ["Go JSON API with request binding","Go service with grouped routes and middleware"]
avoid_when: ["Standard http.Handler functions alone meet the need","Framework-specific handler contexts are unwanted"]
performs_best: ["Go route groups and explicit binding rules"]
related: ["go","net-http","httptest","gorm"]
practices: ["go-errors","go-context","go-layout"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","gin"]
---

# Gin

Gin provides routing, middleware and request binding for Go. Bind only allowed fields and distinguish parsing from business validation. Map errors to intentional HTTP responses rather than exposing internal errors.

Related notes: [[go]], [[net-http]], [[httptest]], [[gorm]].

[Official reference](https://gin-gonic.com/en/docs/).
