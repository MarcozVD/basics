---
type: "tech"
kind: "tool"
title: "Cargo test"
layer: "testing"
language: "rust"
use_when: ["Pruebas unitarias y de integración Rust","Ejemplos Rust de documentación que deben compilar"]
avoid_when: ["La automatización del navegador es el requisito principal","Se exige una función de un runner específico","Suites de tests escritas en Python, JavaScript o TypeScript"]
performs_best: ["Flujo de pruebas integrado en Rust","Cobertura Rust unitaria de integración y documentación"]
related: ["rust","cargo-nextest","proptest","insta"]
practices: ["rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","cargo-test"]
---

# Cargo test

cargo test es la entrada de pruebas del toolchain Rust. Incluye casos de éxito y rechazo, aísla recursos externos y verifica que se ejecutaron pruebas relevantes. Selecciona targets explícitamente al limitar una ejecución.

Notas relacionadas: [[rust]], [[cargo-nextest]], [[proptest]], [[insta]].

Referencia oficial: [Cargo test](https://doc.rust-lang.org/cargo/commands/cargo-test.html).
