---
type: "tech"
kind: "framework"
title: "Actix Web"
layer: "backend"
language: "rust"
use_when: ["Servicios HTTP Rust con extractores Actix","Rutas Rust con middleware Actix"]
avoid_when: ["Se exige una interfaz exclusiva de middleware Tower","Debe ampliarse una aplicación Python existente"]
performs_best: ["Estado de aplicación y extractores explícitos","Flujo de trabajo de un framework HTTP Rust establecido"]
related: ["rust","serde","tracing","diesel"]
practices: ["rust-error-handling","rust-project-layout","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","actix-web"]
---

# Actix Web

Actix Web ofrece rutas, extractores y middleware. Es distinto del framework de actores Actix; los handlers HTTP no exigen diseñar actores. Evita trabajo bloqueante en los workers de peticiones.

Notas relacionadas: [[rust]], [[serde]], [[tracing]], [[diesel]].

Referencia oficial: [Actix Web](https://actix.rs/docs/).
