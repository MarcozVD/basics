---
type: "check"
title: "Native module and component tests"
kind: "test"
command: "npx --no-install jest --runInBand"
applies_to: ["react-native","expo","react-native-mmkv","async-storage","tanstack-query","jest","react-native-testing-library","detox"]
---

Requires the project's Jest preset, transforms and tests. Cover rejected input and visible component behavior. Mocked native modules require complementary device tests; a passing empty suite is not coverage.
