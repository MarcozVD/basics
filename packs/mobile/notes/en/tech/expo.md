---
type: "tech"
kind: "framework"
title: "Expo"
layer: "mobile"
language: "typescript"
use_when: ["Expo workflows for React Native mobile apps","Native mobile builds using Expo modules and development builds"]
avoid_when: ["The app cannot adopt Expo configuration or tooling","A Dart or platform-native UI framework is required","A server API or browser-only web UI is the deliverable","Browser React dashboards using DOM components"]
performs_best: ["React Native tooling and coordinated module workflows"]
related: ["react-native","typescript","async-storage","jest"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","expo"]
---

# Expo

Expo provides tools and modules around React Native. Check native module support and use development builds when the app needs custom native capabilities. A JavaScript update cannot replace every native binary change; review runtime compatibility before publishing updates.

Related notes: [[react-native]], [[typescript]], [[async-storage]], [[jest]].

[Official reference](https://docs.expo.dev/).
