---
type: "tech"
kind: "library"
title: "tracing"
layer: "backend"
language: "rust"
use_when: ["Diagnóstico Rust con spans estructurados","Operaciones asíncronas Rust con eventos correlacionados"]
avoid_when: ["Basta con una impresión sencilla","La aplicación no puede configurar un subscriber"]
performs_best: ["Spans que agrupan operaciones relacionadas","Eventos separados de su política de salida"]
related: ["rust","tokio","axum"]
practices: ["rust-error-handling","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","tracing"]
---

# tracing

tracing registra spans y eventos estructurados. Configura un subscriber en el ejecutable, conserva identificadores útiles y omite credenciales y cuerpos sensibles. Instrumentar no configura por sí solo un backend de telemetría.

Notas relacionadas: [[rust]], [[tokio]], [[axum]].

Referencia oficial: [tracing](https://docs.rs/tracing/latest/tracing/).
