---
type: "tech"
kind: "framework"
title: "React Native"
layer: "mobile"
language: "typescript"
use_when: ["React Native apps sharing native screens across Android and iOS","Native mobile UI with React components"]
avoid_when: ["The deliverable is a browser-only website","Dart widgets are the required UI model","A server API or browser-only web UI is the deliverable","Browser React dashboards using DOM components"]
performs_best: ["Native mobile components with React composition"]
related: ["expo","typescript","react-native-mmkv","react-native-testing-library"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","react-native"]
---

# React Native

React Native builds mobile interfaces with React and native components. Choose compatible native modules, test device behavior and keep platform-specific code explicit. TypeScript checks do not validate network payloads or native permissions.

Related notes: [[expo]], [[typescript]], [[react-native-mmkv]], [[react-native-testing-library]].

[Official reference](https://reactnative.dev/docs/getting-started).
