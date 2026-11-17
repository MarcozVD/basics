---
type: "check"
title: "Flutter device integration"
kind: "test"
command: "flutter test integration_test"
applies_to: ["flutter","flutter-integration-test"]
---

Requires an integration_test suite, a built app and a configured compatible device/emulator. Select the intended target explicitly in CI when several are connected. Test permissions, restoration and offline flows; no device is provisioned by this note.
