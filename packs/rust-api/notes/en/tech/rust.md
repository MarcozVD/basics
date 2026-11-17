---
type: "tech"
kind: "language"
title: "Rust"
layer: "backend"
use_when: ["Rust services with explicit ownership","Rust native applications sharing typed domain logic"]
avoid_when: ["Rapid scripting without a compilation step","A Python or JavaScript runtime is mandatory"]
performs_best: ["Ownership checked during compilation","Native binaries with explicit error types"]
related: ["axum","actix-web","tokio","serde"]
practices: ["rust-error-handling","rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","rust"]
---

# Rust

Rust checks ownership and types during compilation. Model recoverable failures with Result; the type system does not replace endpoint or persistence tests. Choose an HTTP framework and data library separately.

Related notes: [[axum]], [[actix-web]], [[tokio]], [[serde]].

Official reference: [Rust](https://doc.rust-lang.org/book/).
