---
type: "tech"
kind: "tool"
title: "Cargo test"
layer: "testing"
language: "rust"
use_when: ["Rust unit and integration suites","Rust documentation examples that must compile"]
avoid_when: ["Browser automation is the main requirement","A custom runner feature is required","Test suites written in Python, JavaScript or TypeScript"]
performs_best: ["Built-in Rust test workflow","Unit integration and documentation coverage"]
related: ["rust","cargo-nextest","proptest","insta"]
practices: ["rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","cargo-test"]
---

# Cargo test

cargo test is the toolchain test entry point. Include behavior assertions for success and rejection paths, isolate external resources and check that meaningful tests actually ran. Use explicit target selection when narrowing a run.

Related notes: [[rust]], [[cargo-nextest]], [[proptest]], [[insta]].

Official reference: [Cargo test](https://doc.rust-lang.org/cargo/commands/cargo-test.html).
