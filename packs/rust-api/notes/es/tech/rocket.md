---
type: "tech"
kind: "framework"
title: "Rocket"
layer: "backend"
language: "rust"
use_when: ["Rutas Rust expresadas con atributos","Guards Rust para requisitos tipados de peticiones"]
avoid_when: ["Se prefiere una interfaz de rutas sin macros","Debe conservarse un servicio Tower existente"]
performs_best: ["Declaraciones de rutas mediante atributos","Guards de peticiones y respuestas tipadas"]
related: ["rust","serde","tokio"]
practices: ["rust-error-handling","rust-project-layout","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","rocket"]
---

# Rocket

Rocket ofrece atributos de rutas, guards de peticiones y responders. Usa guards para los requisitos y devuelve fallos explícitos. Verifica las funciones elegidas y el compilador admitido antes de actualizar.

Notas relacionadas: [[rust]], [[serde]], [[tokio]].

Referencia oficial: [Rocket](https://rocket.rs/guide/v0.5/).
