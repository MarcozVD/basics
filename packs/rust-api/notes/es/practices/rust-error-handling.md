---
type: "practice"
title: "Manejo de errores Rust"
applies_to: ["rust","axum","actix-web","rocket","poem","warp","serde","tracing","proptest"]
---

# Manejo de errores Rust

Devuelve Result para fallos recuperables. Separa errores del dominio y estados HTTP. Valida entradas en el límite; evita unwrap o expect en rutas con datos no confiables. Registra contexto útil con [[tracing]] y devuelve errores sin detalles sensibles. Prueba entradas rechazadas, registros ausentes y dependencias fallidas.

[Referencia oficial](https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html).
