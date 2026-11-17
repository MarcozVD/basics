---
type: "tech"
kind: "library"
title: "SeaORM"
layer: "data"
language: "rust"
use_when: ["Persistencia asíncrona Rust con entidades","Proyectos Rust que prefieren un flujo ORM"]
avoid_when: ["El SQL directo es más sencillo para la carga","El equipo no mantendrá los modelos de entidades"]
performs_best: ["Operaciones relacionales basadas en entidades","Flujos ORM asíncronos con migraciones"]
related: ["rust","sqlx","postgresql","sqlite"]
practices: ["rust-data-access","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","sea-orm"]
---

# SeaORM

SeaORM aporta acceso asíncrono basado en entidades. Elige funciones de base de datos y runtime, revisa entidades generadas y prueba transacciones con el motor real. Un ORM no elimina la revisión de consultas.

Notas relacionadas: [[rust]], [[sqlx]], [[postgresql]], [[sqlite]].

Referencia oficial: [SeaORM](https://www.sea-ql.org/SeaORM/docs/index/).
