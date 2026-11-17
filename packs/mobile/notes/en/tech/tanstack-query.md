---
type: "tech"
kind: "library"
title: "TanStack Query"
layer: "data"
language: "typescript"
use_when: ["React Native remote-state caching and invalidation","Mobile client requests needing retry and refetch policies"]
avoid_when: ["A durable local relational database is required","Only component-local UI state is needed"]
performs_best: ["Remote state lifecycle and cache invalidation"]
related: ["react-native","async-storage","react-native-mmkv"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","tanstack-query"]
---

# TanStack Query

TanStack Query manages remote-state cache and request lifecycles. In React Native, connect focus and connectivity signals deliberately. Persistence, offline mutation queues and conflict resolution require explicit policies; an in-memory cache is not an offline database.

Related notes: [[react-native]], [[async-storage]], [[react-native-mmkv]].

[Official reference](https://tanstack.com/query/latest/docs/framework/react/react-native).
