---
type: "tech"
kind: "library"
title: "net/http/httptest"
layer: "testing"
language: "go"
use_when: ["Go HTTP handlers tested with recorders","Go HTTP clients tested against local test servers"]
avoid_when: ["Only a framework-native handler API is available without an adapter","A real remote service contract must be verified"]
performs_best: ["Go HTTP response recorders and local test servers"]
related: ["go","net-http","chi","go-test"]
practices: ["go-context","go-layout","go-errors"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","httptest"]
---

# net/http/httptest

httptest provides Go response recorders and local HTTP test servers. Use recorders for compatible handlers and servers for client behavior. Assert status, headers and body, close servers and test cancellation. Frameworks with other handler models may need adapters or their own test APIs.

Related notes: [[go]], [[net-http]], [[chi]], [[go-test]].

[Official reference](https://pkg.go.dev/net/http/httptest).
