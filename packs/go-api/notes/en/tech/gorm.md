---
type: "tech"
kind: "library"
title: "GORM"
layer: "data"
language: "go"
use_when: ["Go persistence with struct-based models","Go application using ORM associations and hooks"]
avoid_when: ["Explicit hand-written SQL is the required interface","Implicit query behavior cannot be accepted"]
performs_best: ["Go model-oriented persistence and associations"]
related: ["go","database-sql","ent","postgresql","sqlite"]
practices: ["go-errors","go-context","go-layout"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","gorm"]
---

# GORM

GORM maps Go models to relational operations. Review emitted SQL, transaction boundaries and association loading. Treat production schema migrations as reviewed changes; automatic migration conveniences do not replace a deployment plan.

Related notes: [[go]], [[database-sql]], [[ent]], [[postgresql]], [[sqlite]].

[Official reference](https://gorm.io/docs/).
