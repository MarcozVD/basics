---
type: "tech"
kind: "library"
title: "SeaORM"
layer: "data"
language: "rust"
use_when: ["Rust async persistence with entity models","Rust projects preferring an ORM workflow"]
avoid_when: ["Direct SQL is simpler for the workload","The team will not maintain entity mappings"]
performs_best: ["Entity-based relational operations","Async ORM workflows with migrations"]
related: ["rust","sqlx","postgresql","sqlite"]
practices: ["rust-data-access","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","sea-orm"]
---

# SeaORM

SeaORM supplies async entity-oriented database access. Select database/runtime features, review generated entities and test transactions against the actual database engine. An ORM does not remove the need to inspect queries.

Related notes: [[rust]], [[sqlx]], [[postgresql]], [[sqlite]].

Official reference: [SeaORM](https://www.sea-ql.org/SeaORM/docs/index/).
