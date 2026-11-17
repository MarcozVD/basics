---
type: "tech"
kind: "library"
title: "Diesel"
layer: "data"
language: "rust"
use_when: ["Persistencia Rust con constructor tipado de consultas","Consultas Rust verificadas contra un esquema declarado"]
avoid_when: ["Se prefiere escribir SQL directamente","Las consultas síncronas bloquearían workers asíncronos"]
performs_best: ["Composición tipada de consultas","Operaciones Rust conscientes del esquema"]
related: ["rust","postgresql","sqlite"]
practices: ["rust-data-access","rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","diesel"]
---

# Diesel

Diesel representa el esquema en Rust y construye consultas tipadas. Sus conexiones estándar son síncronas; define el límite de ejecución en un servidor asíncrono. Mantén esquema y migraciones alineados.

Notas relacionadas: [[rust]], [[postgresql]], [[sqlite]].

Referencia oficial: [Diesel](https://docs.rs/diesel/latest/diesel/).
