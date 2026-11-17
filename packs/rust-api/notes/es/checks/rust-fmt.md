---
type: "check"
title: "Formato Cargo"
kind: "lint"
applies_to: ["rust","axum","actix-web","rocket","poem","warp","tokio","serde","tracing","sqlx","diesel","sea-orm","rusqlite","cargo-test","cargo-nextest","insta","proptest","wiremock-rs"]
command: "cargo fmt --all -- --check"
---

# Formato Cargo

Ejecuta desde la raíz del workspace con rustfmt instalado. El modo de comprobación informa diferencias sin reescribir archivos. El formato no verifica el comportamiento de las rutas.

[Documentación oficial del comando](https://github.com/rust-lang/rustfmt).
