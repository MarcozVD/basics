---
type: "check"
title: "Cargo Clippy"
kind: "lint"
applies_to: ["rust","axum","actix-web","rocket","poem","warp","tokio","serde","tracing","sqlx","diesel","sea-orm","rusqlite","cargo-test","cargo-nextest","insta","proptest","wiremock-rs"]
command: "cargo clippy --workspace --all-targets -- -D warnings"
---

# Cargo Clippy

Run from the Cargo workspace root with Clippy installed. Resolve diagnostics or justify narrow allowances; do not silence the whole workspace. This checks selected targets with the project's default features, not every possible feature combination.

[Official command documentation](https://doc.rust-lang.org/clippy/usage.html).
