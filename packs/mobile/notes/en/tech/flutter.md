---
type: "tech"
kind: "framework"
title: "Flutter"
layer: "mobile"
language: "dart"
use_when: ["Flutter apps sharing widget UI across mobile platforms","Dart mobile apps with declarative widgets"]
avoid_when: ["React Native modules and React components must be reused directly","Only platform-native UI code is permitted","A server API or browser-only web UI is the deliverable"]
performs_best: ["Dart widget composition and integrated mobile tooling"]
related: ["dart","drift","riverpod","flutter-test"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["flutter-analyze","flutter-unit","flutter-device"]
tags: ["mobile","flutter"]
---

# Flutter

Flutter builds interfaces from Dart widgets. Separate rendering, state and persistence, check plugin platform support and test real device integration. Shared UI does not eliminate platform-specific permission, accessibility or release work.

Related notes: [[dart]], [[drift]], [[riverpod]], [[flutter-test]].

[Official reference](https://docs.flutter.dev/).
