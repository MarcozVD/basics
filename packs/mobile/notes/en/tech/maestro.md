---
type: "tech"
kind: "tool"
title: "Maestro"
layer: "testing"
use_when: ["Mobile device flows expressed in YAML","Black-box app navigation across native screens"]
avoid_when: ["Fine-grained unit assertions are the goal","The app cannot expose stable accessible selectors"]
performs_best: ["Declarative mobile interaction flows"]
related: ["react-native","flutter","detox"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: []
tags: ["mobile","maestro"]
---

# Maestro

Maestro automates app flows using YAML. Use stable accessible selectors, reset app state and provide deterministic fixtures. Its flow language is independent of the app implementation; test real permissions and platform differences explicitly.

Related notes: [[react-native]], [[flutter]], [[detox]].

[Official reference](https://docs.maestro.dev/).
