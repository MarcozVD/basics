---
type: "check"
title: "Native TypeScript lint"
kind: "lint"
command: "npx --no-install eslint ."
applies_to: ["react-native","expo","react-native-mmkv","async-storage","tanstack-query","jest","react-native-testing-library","detox"]
---

Use the existing local ESLint installation and React Native project configuration. Configure TypeScript parsing and native globals deliberately. This command does not install dependencies or validate native binaries.
