---
type: "tech"
kind: "library"
title: "React Native Testing Library"
layer: "testing"
language: "typescript"
use_when: ["React Native component interactions through accessible queries","Native UI assertions focused on user-visible behavior"]
avoid_when: ["A real native binary or system permission flow is the subject","Flutter widgets are under test","Browser React component tests using a DOM renderer"]
performs_best: ["Component-level interactions with accessibility-oriented queries"]
related: ["react-native","jest","detox"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","react-native-testing-library"]
---

# React Native Testing Library

React Native Testing Library exercises component behavior without replacing device tests. Query accessible roles and labels, assert visible outcomes and await asynchronous changes. It cannot prove native layout, system dialogs or hardware integration.

Related notes: [[react-native]], [[jest]], [[detox]].

[Official reference](https://oss.callstack.com/react-native-testing-library/).
