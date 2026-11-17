---
type: "tech"
kind: "library"
title: "Bloc"
layer: "data"
language: "dart"
use_when: ["Flutter mobile state with explicit events and transitions","Dart screen logic benefiting from observable state sequences"]
avoid_when: ["A simple local value is enough","A database or synchronization engine is required"]
performs_best: ["Explicit event/state modeling and transition tests"]
related: ["flutter","riverpod","drift"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["flutter-analyze","flutter-unit","flutter-device"]
tags: ["mobile","bloc"]
---

# Bloc

Bloc organizes Dart logic around state transitions; choose Bloc or Cubit according to event complexity. Test cancellation and failure sequences and separate persistence from presentation. More classes are not automatically better state design.

Related notes: [[flutter]], [[riverpod]], [[drift]].

[Official reference](https://bloclibrary.dev/).
