---
type: "tech"
kind: "library"
title: "React Native MMKV"
layer: "data"
language: "typescript"
use_when: ["React Native mobile preferences using a synchronous storage API","Native client key-value persistence with explicit serialization"]
avoid_when: ["Large relational datasets require joins and migrations","No native storage dependency can be installed"]
performs_best: ["Synchronous native key-value access"]
related: ["react-native","async-storage","sqlite"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","react-native-mmkv"]
---

# React Native MMKV

React Native MMKV exposes native key-value storage. Check the selected release's native requirements, choose serialization deliberately and keep large work off interaction paths. Configure encryption/key handling separately if required; storage is not automatically a credential vault.

Related notes: [[react-native]], [[async-storage]], [[sqlite]].

[Official reference](https://github.com/margelo/react-native-mmkv).
