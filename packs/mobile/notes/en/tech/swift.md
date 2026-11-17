---
type: "tech"
kind: "language"
title: "Swift"
layer: "mobile"
language: "swift"
use_when: ["Typed Apple client modules with optionals are needed","Apple platform APIs are consumed directly"]
avoid_when: ["A Dart or Kotlin compiler is mandatory","Android is the only UI target","A server API or browser-only web UI is the deliverable"]
performs_best: ["Typed models and direct Apple API integration"]
related: ["swiftui","kotlin","dart"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: []
tags: ["typed-client","language-design"]
---

# Swift

Swift offers typed models, optionals and concurrency features. Separate language choices from the UI framework and verify platform availability for APIs. Concurrency annotations do not replace cancellation or persistence tests.

Related notes: [[swiftui]], [[kotlin]], [[dart]].

[Official reference](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/).
