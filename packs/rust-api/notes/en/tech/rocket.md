---
type: "tech"
kind: "framework"
title: "Rocket"
layer: "backend"
language: "rust"
use_when: ["Rust routes expressed with attributes","Rust request guards for typed request requirements"]
avoid_when: ["A macro-free routing interface is preferred","An existing Tower service must remain unchanged"]
performs_best: ["Attribute-based route declarations","Request guards and typed responders"]
related: ["rust","serde","tokio"]
practices: ["rust-error-handling","rust-project-layout","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","rocket"]
---

# Rocket

Rocket offers route attributes, request guards and responders. Use guards for request requirements and return explicit failures. Verify selected crate features and the supported compiler before upgrading.

Related notes: [[rust]], [[serde]], [[tokio]].

Official reference: [Rocket](https://rocket.rs/guide/v0.5/).
