---
type: "tech"
kind: "library"
title: "Tokio"
layer: "backend"
language: "rust"
use_when: ["Rust asynchronous networking with Tokio","Rust libraries that require a Tokio runtime"]
avoid_when: ["The workload is entirely synchronous","A different runtime is a firm dependency"]
performs_best: ["Asynchronous I/O and task scheduling","Channels and coordinated task lifetimes"]
related: ["rust","axum","serde","tracing"]
practices: ["rust-async-runtime","rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","tokio"]
---

# Tokio

Tokio supplies an async runtime, I/O and task primitives; it is not an HTTP framework. Bound concurrency and move blocking work to a suitable boundary. Arrange graceful shutdown for spawned tasks.

Related notes: [[rust]], [[axum]], [[serde]], [[tracing]].

Official reference: [Tokio](https://tokio.rs/tokio/tutorial).
