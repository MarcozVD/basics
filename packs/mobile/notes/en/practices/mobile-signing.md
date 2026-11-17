---
type: "practice"
title: "Mobile signing and release secrets"
applies_to: ["react-native","expo","flutter","jetpack-compose","swiftui","dart","kotlin","swift","drift","hive-ce","react-native-mmkv","async-storage","tanstack-query","riverpod","bloc","jest","react-native-testing-library","detox","maestro","flutter-test","flutter-integration-test"]
---

Keep signing keys, provisioning credentials and store tokens outside the repository. Use managed CI secrets with scoped access and document recovery/rotation. Commit only placeholder configuration. Build development and release variants deliberately and verify runtime permissions, app identifiers and update compatibility before distribution.

[Official reference](https://reactnative.dev/docs/signed-apk-android).
