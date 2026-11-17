---
type: "tech"
kind: "tool"
title: "Detox"
layer: "testing"
language: "typescript"
use_when: ["React Native mobile flows exercised in a built app","Native end-to-end scenarios requiring app synchronization"]
avoid_when: ["Only pure module logic needs coverage","The project cannot provision a compatible native build and simulator"]
performs_best: ["App-level React Native end-to-end interactions"]
related: ["react-native","expo","jest"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","detox"]
---

# Detox

Detox automates compatible native builds with synchronized interactions. Configure build variants, simulator/emulator state and test accounts. Treat synchronization as assistance rather than proof that every asynchronous flow is deterministic.

Related notes: [[react-native]], [[expo]], [[jest]].

[Official reference](https://wix.github.io/Detox/).
