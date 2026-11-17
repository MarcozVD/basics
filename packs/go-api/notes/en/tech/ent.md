---
type: "tech"
kind: "tool"
title: "Ent"
layer: "data"
language: "go"
use_when: ["Go typed entity clients generated from schemas","Go model relationships expressed as schema edges"]
avoid_when: ["A schema-driven code generator is unwanted","SQL files must be the only persistence abstraction"]
performs_best: ["Generated Go entity APIs and relationship traversal"]
related: ["go","gorm","sqlc","postgresql","sqlite"]
practices: ["go-layout","go-errors","go-context"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","ent"]
---

# Ent

Ent generates Go clients from schema definitions. Pin generation tools, review schema and migration changes, and test constraints on the chosen engine. Generated types do not remove the need to inspect query patterns and transaction boundaries.

Related notes: [[go]], [[gorm]], [[sqlc]], [[postgresql]], [[sqlite]].

[Official reference](https://entgo.io/docs/getting-started/).
