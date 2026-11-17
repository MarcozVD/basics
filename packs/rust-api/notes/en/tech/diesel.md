---
type: "tech"
kind: "library"
title: "Diesel"
layer: "data"
language: "rust"
use_when: ["Rust persistence with a typed query builder","Rust queries checked against a declared schema"]
avoid_when: ["Handwritten SQL is the preferred interface","Synchronous queries would block async request workers"]
performs_best: ["Typed query composition","Schema-aware Rust database operations"]
related: ["rust","postgresql","sqlite"]
practices: ["rust-data-access","rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","diesel"]
---

# Diesel

Diesel models a database schema in Rust and builds typed queries. Its standard connections are synchronous; plan the execution boundary in an async server. Keep schema declarations aligned with migrations.

Related notes: [[rust]], [[postgresql]], [[sqlite]].

Official reference: [Diesel](https://docs.rs/diesel/latest/diesel/).
