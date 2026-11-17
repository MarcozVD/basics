---
type: "practice"
title: "Estructura de servicios Rust"
applies_to: ["rust","axum","actix-web","rocket","poem","warp","tokio","serde","tracing","sqlx","diesel","sea-orm","rusqlite","cargo-test","cargo-nextest","insta","proptest","wiremock-rs"]
---

# Estructura de servicios Rust

Empieza con un crate y módulos claros de HTTP, dominio y persistencia. Extrae crates de workspace cuando lo justifique la propiedad o reutilización. Configura explícitamente y versiona Cargo.lock en aplicaciones desplegadas. Escribe contratos de rutas en pruebas de integración y comprobaciones pequeñas junto al dominio. Ejecuta [[rust-fmt]], [[rust-clippy]] y [[rust-tests]].

[Referencia oficial](https://doc.rust-lang.org/book/ch07-01-packages-and-crates.html).
