---
type: "tech"
kind: "framework"
title: "Warp"
layer: "backend"
language: "rust"
use_when: ["Rust routes composed from Warp filters","Rust services using combinator-style routing"]
avoid_when: ["The team prefers explicit handler functions","Complex filter types would dominate maintenance"]
performs_best: ["Composable request filters","Combining extraction with route conditions"]
related: ["rust","tokio","serde"]
practices: ["rust-error-handling","rust-project-layout","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","warp"]
---

# Warp

Warp composes routes from filters. Keep filter chains readable and centralize rejection handling. Evaluate type complexity with a small endpoint before adopting this style across a service.

Related notes: [[rust]], [[tokio]], [[serde]].

Official reference: [Warp](https://github.com/seanmonstar/warp).
