---
type: "tech"
kind: "framework"
title: "Warp"
layer: "backend"
language: "rust"
use_when: ["Rutas Rust compuestas con filtros Warp","Servicios Rust con rutas mediante combinadores"]
avoid_when: ["El equipo prefiere funciones de handler explícitas","Los tipos complejos de filtros dificultan el mantenimiento"]
performs_best: ["Filtros de peticiones componibles","Extracción combinada con condiciones de rutas"]
related: ["rust","tokio","serde"]
practices: ["rust-error-handling","rust-project-layout","rust-async-runtime"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","warp"]
---

# Warp

Warp compone rutas a partir de filtros. Mantén cadenas legibles y centraliza el manejo de rechazos. Evalúa la complejidad de tipos con una ruta pequeña antes de extender este estilo.

Notas relacionadas: [[rust]], [[tokio]], [[serde]].

Referencia oficial: [Warp](https://github.com/seanmonstar/warp).
