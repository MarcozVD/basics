---
type: "practice"
title: "Rust service layout"
applies_to: ["rust","axum","actix-web","rocket","poem","warp","tokio","serde","tracing","sqlx","diesel","sea-orm","rusqlite","cargo-test","cargo-nextest","insta","proptest","wiremock-rs"]
---

# Rust service layout

Start with one crate and clear HTTP, domain and persistence modules. Extract workspace crates when ownership or reuse justifies them. Keep configuration explicit and commit Cargo.lock for deployed applications. Put endpoint contracts in integration tests and small domain assertions near their code. Run [[rust-fmt]], [[rust-clippy]] and [[rust-tests]].

[Official reference](https://doc.rust-lang.org/book/ch07-01-packages-and-crates.html).
