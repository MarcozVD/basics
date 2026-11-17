---
type: "check"
title: "Cargo workspace tests"
kind: "test"
applies_to: ["rust","axum","actix-web","rocket","poem","warp","tokio","serde","tracing","sqlx","diesel","sea-orm","rusqlite","cargo-test","cargo-nextest","insta","proptest","wiremock-rs"]
command: "cargo test --workspace"
---

# Cargo workspace tests

Run the existing unit, integration and documentation tests from the workspace root. Include successful and rejected HTTP requests and persistence failures. A passing empty suite is not endpoint coverage. Provision any required test database explicitly.

[Official command documentation](https://doc.rust-lang.org/cargo/commands/cargo-test.html).
