---
type: "tech"
kind: "library"
title: "Flutter integration_test"
layer: "testing"
language: "dart"
use_when: ["Flutter mobile app flows on a device or emulator","Plugin and navigation behavior beyond widget isolation"]
avoid_when: ["A unit or widget test can prove the same property","No compatible device target or app build is available","Unit-only edit-save checks without building or launching an app"]
performs_best: ["Flutter app integration on configured device targets"]
related: ["flutter","flutter-test","maestro"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["flutter-analyze","flutter-unit","flutter-device"]
tags: ["mobile","flutter-integration-test"]
---

# Flutter integration_test

integration_test exercises a built Flutter app on configured targets. Provision devices, test data and permissions and keep scenario setup explicit. A single platform run does not establish compatibility with every supported device.

Related notes: [[flutter]], [[flutter-test]], [[maestro]].

[Official reference](https://docs.flutter.dev/testing/integration-tests).
