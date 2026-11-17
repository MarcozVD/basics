---
type: "tech"
kind: "library"
title: "Serde"
layer: "backend"
language: "rust"
use_when: ["Serialización Rust con modelos derivados","Formatos Rust basados en traits Serde"]
avoid_when: ["Se necesita una biblioteca de serialización de otro lenguaje","El formato elegido carece de serializador adecuado"]
performs_best: ["Traits de serialización reutilizables","Estructuras explícitas de peticiones y respuestas"]
related: ["rust","axum","rocket","insta"]
practices: ["rust-error-handling","rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","serde"]
---

# Serde

Serde conecta estructuras Rust con formatos de serialización. Elige aparte la implementación del formato, valida restricciones del dominio después del parseo y separa respuestas de registros con secretos.

Notas relacionadas: [[rust]], [[axum]], [[rocket]], [[insta]].

Referencia oficial: [Serde](https://serde.rs/).
