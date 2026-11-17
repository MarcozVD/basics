---
type: "tech"
kind: "library"
title: "rusqlite"
layer: "data"
language: "rust"
use_when: ["Aplicaciones Rust que integran SQLite directamente","Persistencia local Rust con consultas síncronas"]
avoid_when: ["Se necesita un servidor remoto de base de datos","Consultas bloqueantes ilimitadas ocuparían workers asíncronos"]
performs_best: ["Acceso directo a SQLite desde Rust","Archivos locales y fixtures en memoria"]
related: ["rust","sqlite"]
practices: ["rust-data-access","rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","rusqlite"]
---

# rusqlite

rusqlite envuelve SQLite con APIs Rust síncronas. Usa parámetros vinculados, define la propiedad de conexiones y separa llamadas bloqueantes en servidores asíncronos. Prueba archivos persistentes además de bases en memoria.

Notas relacionadas: [[rust]], [[sqlite]].

Referencia oficial: [rusqlite](https://docs.rs/rusqlite/latest/rusqlite/).
