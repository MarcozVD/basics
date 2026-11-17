---
type: "practice"
title: "Rust error handling"
applies_to: ["rust","axum","actix-web","rocket","poem","warp","serde","tracing","proptest"]
---

# Rust error handling

Return Result for recoverable failures. Separate domain errors from HTTP status mapping. Validate input at the boundary; avoid unwrap or expect on untrusted request paths. Record useful internal context with [[tracing]] while returning sanitized errors. Test rejected input, missing records and dependency failures.

[Official reference](https://doc.rust-lang.org/book/ch09-02-recoverable-errors-with-result.html).
