---
type: "tech"
kind: "language"
title: "Kotlin"
layer: "mobile"
language: "kotlin"
use_when: ["JVM interoperability and null-aware types are needed","Typed Android packages share domain logic"]
avoid_when: ["A Dart or Swift compiler is required","A browser-only UI is the deliverable","A server API or browser-only web UI is the deliverable"]
performs_best: ["Null-aware domain models and JVM interoperability"]
related: ["jetpack-compose","swift","dart"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: []
tags: ["typed-client","language-design"]
---

# Kotlin

Kotlin offers null-aware types and Java interoperability. In Android apps, choose UI and lifecycle tooling deliberately. Coroutines and concurrent state still require cancellation, ownership and resource-limit decisions.

Related notes: [[jetpack-compose]], [[swift]], [[dart]].

[Official reference](https://kotlinlang.org/docs/home.html).
