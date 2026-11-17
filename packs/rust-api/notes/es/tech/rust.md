---
type: "tech"
kind: "language"
title: "Rust"
layer: "backend"
use_when: ["Servicios Rust con propiedad explícita","Aplicaciones nativas Rust con lógica de dominio tipada"]
avoid_when: ["Scripts rápidos sin compilación","Es obligatorio un runtime Python o JavaScript"]
performs_best: ["Propiedad verificada durante la compilación","Binarios nativos con errores explícitos"]
related: ["axum","actix-web","tokio","serde"]
practices: ["rust-error-handling","rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","rust"]
---

# Rust

Rust verifica propiedad y tipos al compilar. Representa fallos recuperables con Result; los tipos no sustituyen las pruebas de rutas o persistencia. Elige aparte el framework HTTP y la biblioteca de datos.

Notas relacionadas: [[axum]], [[actix-web]], [[tokio]], [[serde]].

Referencia oficial: [Rust](https://doc.rust-lang.org/book/).
