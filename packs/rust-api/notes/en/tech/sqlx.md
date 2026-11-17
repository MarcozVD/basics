---
type: "tech"
kind: "library"
title: "SQLx"
layer: "data"
language: "rust"
use_when: ["Rust persistence with explicit SQL","Rust async queries without an ORM model layer"]
avoid_when: ["An entity-oriented ORM is preferred","Compile-time query macros cannot access schema metadata"]
performs_best: ["Async database access with explicit queries","Optional schema-checked query macros"]
related: ["rust","postgresql","sqlite","tokio"]
practices: ["rust-data-access","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","sqlx"]
---

# SQLx

Choose database and runtime features deliberately. Checked query macros need a matching schema or prepared offline metadata; ordinary queries still need runtime validation. Parameterize values and apply versioned migrations.

Related notes: [[rust]], [[postgresql]], [[sqlite]], [[tokio]].

Official reference: [SQLx](https://docs.rs/sqlx/latest/sqlx/).
