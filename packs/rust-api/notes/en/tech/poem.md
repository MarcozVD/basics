---
type: "tech"
kind: "framework"
title: "Poem"
layer: "backend"
language: "rust"
use_when: ["Rust endpoint composition with Poem","Rust handlers using Poem extractors"]
avoid_when: ["A framework-specific integration targets another ecosystem","A macro-free codebase is a firm constraint"]
performs_best: ["Endpoint and middleware composition","Typed extractors with a test client"]
related: ["rust","tokio","serde"]
practices: ["rust-error-handling","rust-project-layout","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","poem"]
---

# Poem

Poem organizes request handling around endpoints, extractors and middleware. Select optional integrations explicitly; an HTTP framework alone does not provide your authorization or persistence policy.

Related notes: [[rust]], [[tokio]], [[serde]].

Official reference: [Poem](https://docs.rs/poem/latest/poem/).
