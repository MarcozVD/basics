---
type: "tech"
kind: "library"
title: "Drift"
layer: "data"
language: "dart"
use_when: ["Flutter mobile persistence with typed SQLite queries","Dart relational client storage with migrations"]
avoid_when: ["A remote database server must be selected","Only a few preference values need storage","Shared records need server-side synchronization across clients"]
performs_best: ["Typed relational client queries and change streams"]
related: ["flutter","sqlite","hive-ce"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["flutter-analyze","flutter-unit","flutter-device"]
tags: ["mobile","drift"]
---

# Drift

Drift adds a Dart persistence layer over SQLite with typed queries and migration support. Select the platform executor, test schema upgrades and transactions, and design synchronization separately. A local database does not by itself resolve remote write conflicts.

Related notes: [[flutter]], [[sqlite]], [[hive-ce]].

[Official reference](https://drift.simonbinder.eu/).
