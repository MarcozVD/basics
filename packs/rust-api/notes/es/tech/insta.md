---
type: "tech"
kind: "library"
title: "Insta"
layer: "testing"
language: "rust"
use_when: ["Snapshots Rust de salidas estructuradas estables","Fixtures Rust de respuestas revisadas como texto"]
avoid_when: ["La salida contiene secretos sin ocultar","No se pueden normalizar valores no deterministas","Suites de tests escritas en Python, JavaScript o TypeScript"]
performs_best: ["Snapshots de salida Rust revisables","Ocultación de valores generados"]
related: ["rust","serde","cargo-test"]
practices: ["rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","insta"]
---

# Insta

Insta compara salidas Rust con snapshots revisados. Normaliza valores inestables y revisa las actualizaciones en lugar de aceptarlas a ciegas. Complementa los snapshots con comprobaciones de permisos, estados y persistencia.

Notas relacionadas: [[rust]], [[serde]], [[cargo-test]].

Referencia oficial: [Insta](https://insta.rs/docs/).
