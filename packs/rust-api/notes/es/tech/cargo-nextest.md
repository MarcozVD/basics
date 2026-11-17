---
type: "tech"
kind: "tool"
title: "cargo-nextest"
layer: "testing"
language: "rust"
use_when: ["Suites Rust que necesitan aislamiento por proceso","Suites CI Rust con configuración del runner"]
avoid_when: ["Basta el runner integrado de Cargo","No se puede instalar un runner adicional","Suites de tests escritas en Python, JavaScript o TypeScript"]
performs_best: ["Aislamiento de cada prueba por proceso","Ejecución configurable de pruebas Rust"]
related: ["rust","cargo-test","proptest","insta"]
practices: ["rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","cargo-nextest"]
---

# cargo-nextest

nextest es un runner adicional para Rust. Fija su instalación en CI y configura recursos para pruebas que comparten base de datos. Revisa su cobertura documentada y conserva pruebas de documentación de Cargo cuando corresponda.

Notas relacionadas: [[rust]], [[cargo-test]], [[proptest]], [[insta]].

Referencia oficial: [cargo-nextest](https://nexte.st/).
