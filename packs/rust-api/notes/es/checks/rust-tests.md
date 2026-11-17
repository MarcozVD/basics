---
type: "check"
title: "Pruebas del workspace Cargo"
kind: "test"
applies_to: ["rust","axum","actix-web","rocket","poem","warp","tokio","serde","tracing","sqlx","diesel","sea-orm","rusqlite","cargo-test","cargo-nextest","insta","proptest","wiremock-rs"]
command: "cargo test --workspace"
---

# Pruebas del workspace Cargo

Ejecuta las pruebas unitarias, de integración y documentación desde la raíz del workspace. Incluye peticiones correctas y rechazadas y fallos de persistencia. Una suite vacía no demuestra cobertura de rutas. Prepara explícitamente la base de pruebas necesaria.

[Documentación oficial del comando](https://doc.rust-lang.org/cargo/commands/cargo-test.html).
