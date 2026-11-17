---
type: "tech"
kind: "framework"
title: "Axum"
layer: "backend"
language: "rust"
use_when: ["Rust HTTP handlers with Tower middleware","Rust services built around Tokio"]
avoid_when: ["A different async runtime is mandatory","A built-in administrative site is required"]
performs_best: ["Composable Tower services","Typed request extraction and response conversion"]
related: ["rust","tokio","serde","tracing","sqlx"]
practices: ["rust-error-handling","rust-project-layout","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","axum"]
---

# Axum

Axum uses Tokio and integrates with Tower middleware. Keep handlers thin, map errors into deliberate HTTP responses and share application state explicitly. Pair it with a separate database library.

Related notes: [[rust]], [[tokio]], [[serde]], [[tracing]], [[sqlx]].

Official reference: [Axum](https://docs.rs/axum/latest/axum/).
