---
type: "profile"
title: "API HTTP Rust"
description: "Servicio Rust con persistencia SQL explícita"
use_when: ["Servicio HTTP Rust con rutas JSON","API Rust respaldada por PostgreSQL"]
stack: {"backend":["rust","axum","tokio","serde","tracing"],"data":["sqlx","postgresql"],"testing":["cargo-test","proptest"]}
---

Una elección inicial, no una obligación: [[axum]] con [[sqlx]] y [[postgresql]]. Evalúa los frameworks y bibliotecas de datos alternativos del pack Rust antes de exportar.
