---
type: "tech"
kind: "library"
title: "tracing"
layer: "backend"
language: "rust"
use_when: ["Rust diagnostics with structured spans","Rust async operations requiring correlated events"]
avoid_when: ["A basic print statement is sufficient","A subscriber cannot be configured by the application"]
performs_best: ["Spans that group related operations","Structured events separated from their output policy"]
related: ["rust","tokio","axum"]
practices: ["rust-error-handling","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","tracing"]
---

# tracing

tracing records structured spans and events. Configure a subscriber in the executable, carry useful request identifiers and omit credentials and sensitive payloads. Instrumentation alone does not configure a telemetry backend.

Related notes: [[rust]], [[tokio]], [[axum]].

Official reference: [tracing](https://docs.rs/tracing/latest/tracing/).
