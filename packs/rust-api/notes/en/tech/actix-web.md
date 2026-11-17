---
type: "tech"
kind: "framework"
title: "Actix Web"
layer: "backend"
language: "rust"
use_when: ["Rust HTTP services using Actix extractors","Rust routing with Actix middleware"]
avoid_when: ["A Tower-only middleware interface is required","A Python application must be extended in place"]
performs_best: ["Explicit application state and extractors","An established Rust HTTP framework workflow"]
related: ["rust","serde","tracing","diesel"]
practices: ["rust-error-handling","rust-project-layout","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","actix-web"]
---

# Actix Web

Actix Web provides routing, extractors and middleware. It is distinct from the Actix actor framework; using HTTP handlers does not require designing an actor system. Keep blocking work away from request workers.

Related notes: [[rust]], [[serde]], [[tracing]], [[diesel]].

Official reference: [Actix Web](https://actix.rs/docs/).
