---
type: "tech"
kind: "library"
title: "Wiremock for Rust"
layer: "testing"
language: "rust"
use_when: ["Clientes HTTP Rust probados con servidores mock locales","Integraciones Rust con respuestas externas controladas"]
avoid_when: ["El comportamiento del navegador es el objeto de la prueba","Debe verificarse un contrato externo real","Suites de tests escritas en Python, JavaScript o TypeScript"]
performs_best: ["Respuestas HTTP controladas","Expectativas aisladas de peticiones externas"]
related: ["rust","tokio","cargo-test"]
practices: ["rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","wiremock-rs"]
---

# Wiremock for Rust

wiremock aporta mocks HTTP locales para clientes Rust. Comprueba los campos relevantes, cubre respuestas fallidas y aísla cada servidor. Mantén pruebas de contrato separadas para las suposiciones sobre el servicio real.

Notas relacionadas: [[rust]], [[tokio]], [[cargo-test]].

Referencia oficial: [Wiremock for Rust](https://docs.rs/wiremock/latest/wiremock/).
