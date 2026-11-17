---
type: "tech"
kind: "library"
title: "Proptest"
layer: "testing"
language: "rust"
use_when: ["Rust invariants checked over generated inputs","Rust parsers needing counterexample reduction"]
avoid_when: ["Only a few fixed examples are useful","A formal proof is required","Test suites written in Python, JavaScript or TypeScript"]
performs_best: ["Input generation and shrinking","Reproducing reduced failing cases"]
related: ["rust","cargo-test","serde"]
practices: ["rust-error-handling"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","proptest"]
---

# Proptest

Proptest generates inputs and reduces failures to smaller counterexamples. Define bounded strategies and meaningful invariants, retain regressions and supplement generated cases with explicit business examples. It is not a formal verification tool.

Related notes: [[rust]], [[cargo-test]], [[serde]].

Official reference: [Proptest](https://proptest-rs.github.io/proptest/intro.html).
