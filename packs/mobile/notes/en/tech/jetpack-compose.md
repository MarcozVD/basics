---
type: "tech"
kind: "framework"
title: "Jetpack Compose"
layer: "mobile"
language: "kotlin"
use_when: ["Android mobile screens written with Kotlin composables","An Android app needing direct platform UI integration"]
avoid_when: ["One shared Dart or React UI implementation is required","iOS screens are the primary target","A server API or browser-only web UI is the deliverable"]
performs_best: ["Declarative Android UI with Kotlin"]
related: ["kotlin","flutter","swiftui"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: []
tags: ["mobile","jetpack-compose"]
---

# Jetpack Compose

Jetpack Compose is an Android UI toolkit using Kotlin composables. Keep state ownership clear, handle lifecycle and test accessibility semantics. This note describes Android Compose, not a promise of shared iOS UI; verify other multiplatform tooling separately.

Related notes: [[kotlin]], [[flutter]], [[swiftui]].

[Official reference](https://developer.android.com/compose).
