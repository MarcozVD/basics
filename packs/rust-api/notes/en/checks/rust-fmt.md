---
type: "check"
title: "Cargo formatting"
kind: "lint"
applies_to: ["rust","axum","actix-web","rocket","poem","warp","tokio","serde","tracing","sqlx","diesel","sea-orm","rusqlite","cargo-test","cargo-nextest","insta","proptest","wiremock-rs"]
command: "cargo fmt --all -- --check"
---

# Cargo formatting

Run from the workspace root with rustfmt installed. Check mode reports formatting differences without rewriting files. Formatting does not verify endpoint behavior.

[Official command documentation](https://github.com/rust-lang/rustfmt).
