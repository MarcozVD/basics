---
type: "tech"
kind: "library"
title: "Testify"
layer: "testing"
language: "go"
use_when: ["Go tests preferring assertion helpers","Go unit cases with readable equality and error assertions"]
avoid_when: ["Only the Go standard library is allowed","A helper library would obscure a few simple conditions"]
performs_best: ["Go assertions layered on the standard testing package"]
related: ["go","go-test","gomock"]
practices: ["go-layout","go-errors"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","testify"]
---

# Testify

Testify adds Go assertion, requirement and mock helpers. Choose fatal versus nonfatal assertions deliberately. Keep failure paths readable and avoid terminating a parent test through assertions in a worker goroutine.

Related notes: [[go]], [[go-test]], [[gomock]].

[Official reference](https://github.com/stretchr/testify).
