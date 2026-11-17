---
type: "tech"
kind: "library"
title: "Serde"
layer: "backend"
language: "rust"
use_when: ["Rust serialization with derived data models","Rust wire formats built around Serde traits"]
avoid_when: ["A non-Rust serialization library is required","The chosen format lacks a suitable serializer"]
performs_best: ["Reusable serialization traits","Explicit request and response data structures"]
related: ["rust","axum","rocket","insta"]
practices: ["rust-error-handling","rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","serde"]
---

# Serde

Serde connects Rust data structures to serialization formats. Choose a format implementation separately, validate domain constraints after parsing and keep response models separate from records containing secrets.

Related notes: [[rust]], [[axum]], [[rocket]], [[insta]].

Official reference: [Serde](https://serde.rs/).
