---
type: "check"
title: "Cargo Clippy"
kind: "lint"
applies_to: ["rust","axum","actix-web","rocket","poem","warp","tokio","serde","tracing","sqlx","diesel","sea-orm","rusqlite","cargo-test","cargo-nextest","insta","proptest","wiremock-rs"]
command: "cargo clippy --workspace --all-targets -- -D warnings"
---

# Cargo Clippy

Ejecuta desde la raíz del workspace Cargo con Clippy instalado. Resuelve diagnósticos o justifica excepciones concretas; no silencies todo el workspace. Comprueba los targets elegidos con funciones predeterminadas, no todas las combinaciones posibles.

[Documentación oficial del comando](https://doc.rust-lang.org/clippy/usage.html).
