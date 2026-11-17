---
type: "tech"
kind: "library"
title: "SQLx"
layer: "data"
language: "rust"
use_when: ["Persistencia Rust con SQL explícito","Consultas asíncronas Rust sin modelos ORM"]
avoid_when: ["Se prefiere un ORM orientado a entidades","Las macros de consulta no pueden acceder al esquema"]
performs_best: ["Acceso asíncrono con consultas explícitas","Macros opcionales verificadas contra el esquema"]
related: ["rust","postgresql","sqlite","tokio"]
practices: ["rust-data-access","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","sqlx"]
---

# SQLx

Elige explícitamente las funciones de base de datos y runtime. Las macros verificadas necesitan esquema o metadatos offline preparados; las consultas ordinarias requieren validación en ejecución. Parametriza valores y aplica migraciones versionadas.

Notas relacionadas: [[rust]], [[postgresql]], [[sqlite]], [[tokio]].

Referencia oficial: [SQLx](https://docs.rs/sqlx/latest/sqlx/).
