---
type: "tech"
kind: "library"
title: "flutter_test"
layer: "testing"
language: "dart"
use_when: ["Flutter widget behavior in a controlled test environment","Dart client logic and widget tree assertions"]
avoid_when: ["Native system integration must be proven","An integrated watch runner repeating on every save is required"]
performs_best: ["Controlled Flutter widget frames and assertions"]
related: ["flutter","dart","flutter-integration-test"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["flutter-analyze","flutter-unit","flutter-device"]
tags: ["mobile","flutter-test"]
---

# flutter_test

flutter_test supplies Flutter test utilities and widget pumping. Keep clocks and asynchronous work controlled and distinguish widget tests from running a native app. File watching requires separate orchestration around the test invocation; native integration needs device-level coverage.

Related notes: [[flutter]], [[dart]], [[flutter-integration-test]].

[Official reference](https://api.flutter.dev/flutter/flutter_test/).
