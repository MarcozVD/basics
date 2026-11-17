---
type: "tech"
kind: "library"
title: "AsyncStorage"
layer: "data"
language: "typescript"
use_when: ["React Native mobile preferences with an asynchronous key-value API","Small non-secret client settings persisted across launches"]
avoid_when: ["Passwords or signing keys must be stored","Relational queries and transactions are needed"]
performs_best: ["Asynchronous persistent client preferences"]
related: ["react-native","react-native-mmkv","sqlite"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","async-storage"]
---

# AsyncStorage

AsyncStorage provides asynchronous persistent key-value storage for React Native. Serialize values explicitly, handle failures and test migrations of preference keys. Treat it as unencrypted storage; use platform-appropriate secure facilities for credentials.

Related notes: [[react-native]], [[react-native-mmkv]], [[sqlite]].

[Official reference](https://github.com/react-native-async-storage/async-storage).
