---
type: "tech"
kind: "library"
title: "Hive CE"
layer: "data"
language: "dart"
use_when: ["Flutter client persistence organized as key-value boxes","Dart mobile models stored without relational joins"]
avoid_when: ["Relational constraints and SQL joins are central","A remote database engine is required"]
performs_best: ["Box-oriented Dart local persistence"]
related: ["flutter","drift","sqlite"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["flutter-analyze","flutter-unit","flutter-device"]
tags: ["mobile","hive-ce"]
---

# Hive CE

Hive CE provides Dart key-value persistence. Review adapters and schema evolution, isolate test boxes and verify platform/file behavior. It is not a relational database or a secret-management policy.

Related notes: [[flutter]], [[drift]], [[sqlite]].

[Official reference](https://pub.dev/packages/hive_ce).
