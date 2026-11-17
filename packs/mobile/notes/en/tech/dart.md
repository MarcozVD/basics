---
type: "tech"
kind: "language"
title: "Dart"
layer: "mobile"
language: "dart"
use_when: ["A null-safe client language with asynchronous functions is wanted","Typed client packages share domain models"]
avoid_when: ["A Kotlin or Swift compiler is mandatory","Existing React UI code must run unchanged","A server API or browser-only web UI is the deliverable"]
performs_best: ["Null-safe client models and asynchronous APIs"]
related: ["flutter","riverpod","bloc"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: []
tags: ["typed-client","language-design"]
---

# Dart

Dart provides typed models, sound null safety and asynchronous APIs. Keep runtime input validation separate from static types. Flutter is a framework using the language; choose its widget and platform tooling separately.

Related notes: [[flutter]], [[riverpod]], [[bloc]].

[Official reference](https://dart.dev/language).
