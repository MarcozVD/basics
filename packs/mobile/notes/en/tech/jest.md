---
type: "tech"
kind: "tool"
title: "Jest"
layer: "testing"
language: "typescript"
use_when: ["React Native module logic and mock-based isolation","Native component projects using the Jest preset"]
avoid_when: ["Real device permission behavior must be proven","The project requires a Flutter widget harness"]
performs_best: ["JavaScript module isolation and configurable mock behavior"]
related: ["react-native","react-native-testing-library","detox"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","jest"]
---

# Jest

Jest runs JavaScript/TypeScript tests with the project's transforms and presets. Native mocks do not prove native module behavior; combine logic checks with device-level coverage. Review snapshots and avoid mocks that hide error paths.

Related notes: [[react-native]], [[react-native-testing-library]], [[detox]].

[Official reference](https://jestjs.io/docs/tutorial-react-native).
