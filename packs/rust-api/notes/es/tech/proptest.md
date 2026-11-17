---
type: "tech"
kind: "library"
title: "Proptest"
layer: "testing"
language: "rust"
use_when: ["Invariantes Rust verificadas con entradas generadas","Parsers Rust que necesitan reducir contraejemplos"]
avoid_when: ["Solo son útiles unos pocos ejemplos fijos","Se necesita una prueba formal","Suites de tests escritas en Python, JavaScript o TypeScript"]
performs_best: ["Generación y reducción de entradas","Reproducción de casos mínimos que fallan"]
related: ["rust","cargo-test","serde"]
practices: ["rust-error-handling"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","proptest"]
---

# Proptest

Proptest genera entradas para pruebas Rust y reduce fallos a contraejemplos menores. Define estrategias acotadas e invariantes útiles, conserva regresiones y añade ejemplos explícitos del dominio. No es una herramienta de verificación formal.

Notas relacionadas: [[rust]], [[cargo-test]], [[serde]].

Referencia oficial: [Proptest](https://proptest-rs.github.io/proptest/intro.html).
