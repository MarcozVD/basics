---
type: "tech"
kind: "tool"
title: "cargo-nextest"
layer: "testing"
language: "rust"
use_when: ["Rust suites needing per-test process isolation","Rust CI suites needing runner configuration"]
avoid_when: ["The built-in Cargo runner is sufficient","An additional runner cannot be installed","Test suites written in Python, JavaScript or TypeScript"]
performs_best: ["Per-test process isolation","Configurable Rust test execution"]
related: ["rust","cargo-test","proptest","insta"]
practices: ["rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","cargo-nextest"]
---

# cargo-nextest

nextest is an additional Rust test runner. Pin its CI installation and configure resources for tests that share a database. Check documented coverage and keep a Cargo documentation-test step where needed; do not assume every runner covers the same targets.

Related notes: [[rust]], [[cargo-test]], [[proptest]], [[insta]].

Official reference: [cargo-nextest](https://nexte.st/).
