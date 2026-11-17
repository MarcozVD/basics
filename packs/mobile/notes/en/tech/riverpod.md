---
type: "tech"
kind: "library"
title: "Riverpod"
layer: "data"
language: "dart"
use_when: ["Flutter screen state and dependencies expressed as providers","Dart mobile asynchronous state with scoped ownership"]
avoid_when: ["Durable storage is the missing component","An explicit event-to-state Bloc model is required"]
performs_best: ["Provider-scoped dependencies and asynchronous screen state"]
related: ["flutter","drift","bloc"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["flutter-analyze","flutter-unit","flutter-device"]
tags: ["mobile","riverpod"]
---

# Riverpod

Riverpod models state and dependencies with providers. Scope and dispose resources intentionally, test loading/error transitions and keep durable persistence separate. A provider alone does not persist records across restarts.

Related notes: [[flutter]], [[drift]], [[bloc]].

[Official reference](https://riverpod.dev/).
