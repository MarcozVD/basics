---
type: "tech"
kind: "library"
title: "Wiremock for Rust"
layer: "testing"
language: "rust"
use_when: ["Rust HTTP clients tested against local mock servers","Rust integrations needing controlled upstream responses"]
avoid_when: ["Browser behavior is the subject of the test","A real upstream contract must be verified","Test suites written in Python, JavaScript or TypeScript"]
performs_best: ["Controlled HTTP responses","Isolated third-party request expectations"]
related: ["rust","tokio","cargo-test"]
practices: ["rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","wiremock-rs"]
---

# Wiremock for Rust

wiremock provides local HTTP mocks for Rust clients. Match relevant request fields, cover failure responses and isolate each server. Keep separate contract tests for assumptions about the real upstream service.

Related notes: [[rust]], [[tokio]], [[cargo-test]].

Official reference: [Wiremock for Rust](https://docs.rs/wiremock/latest/wiremock/).
