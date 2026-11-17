---
type: "tech"
kind: "framework"
title: "Axum"
layer: "backend"
language: "rust"
use_when: ["Handlers HTTP Rust con middleware Tower","Servicios Rust basados en Tokio"]
avoid_when: ["Es obligatorio otro runtime asíncrono","Se necesita un sitio administrativo integrado"]
performs_best: ["Servicios Tower componibles","Extracción tipada y conversión de respuestas"]
related: ["rust","tokio","serde","tracing","sqlx"]
practices: ["rust-error-handling","rust-project-layout","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","axum"]
---

# Axum

Axum usa Tokio y se integra con middleware Tower. Mantén handlers pequeños, convierte errores en respuestas HTTP deliberadas y comparte el estado explícitamente. Combínalo con una biblioteca de datos separada.

Notas relacionadas: [[rust]], [[tokio]], [[serde]], [[tracing]], [[sqlx]].

Referencia oficial: [Axum](https://docs.rs/axum/latest/axum/).
