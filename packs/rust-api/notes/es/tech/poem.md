---
type: "tech"
kind: "framework"
title: "Poem"
layer: "backend"
language: "rust"
use_when: ["Composición de endpoints Rust con Poem","Handlers Rust con extractores Poem"]
avoid_when: ["Una integración específica exige otro ecosistema","Es obligatorio evitar macros en el código"]
performs_best: ["Composición de endpoints y middleware","Extractores tipados con cliente de pruebas"]
related: ["rust","tokio","serde"]
practices: ["rust-error-handling","rust-project-layout","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","poem"]
---

# Poem

Poem organiza las peticiones con endpoints, extractores y middleware. Elige explícitamente las integraciones opcionales; un framework HTTP no define tu política de autorización o persistencia.

Notas relacionadas: [[rust]], [[tokio]], [[serde]].

Referencia oficial: [Poem](https://docs.rs/poem/latest/poem/).
