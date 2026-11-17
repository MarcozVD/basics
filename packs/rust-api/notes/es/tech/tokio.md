---
type: "tech"
kind: "library"
title: "Tokio"
layer: "backend"
language: "rust"
use_when: ["Redes asíncronas Rust con Tokio","Bibliotecas Rust que requieren runtime Tokio"]
avoid_when: ["La carga es totalmente síncrona","Otro runtime es una dependencia obligatoria"]
performs_best: ["E/S asíncrona y planificación de tareas","Canales y ciclos de vida coordinados"]
related: ["rust","axum","serde","tracing"]
practices: ["rust-async-runtime","rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","tokio"]
---

# Tokio

Tokio aporta runtime asíncrono, E/S y tareas; no es un framework HTTP. Limita la concurrencia y separa el trabajo bloqueante. Organiza el cierre ordenado de las tareas creadas.

Notas relacionadas: [[rust]], [[axum]], [[serde]], [[tracing]].

Referencia oficial: [Tokio](https://tokio.rs/tokio/tutorial).
