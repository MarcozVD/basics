---
type: "profile"
title: "Rust HTTP API"
description: "Rust service with explicit SQL persistence"
use_when: ["Rust HTTP service with JSON endpoints","Rust API backed by PostgreSQL"]
stack: {"backend":["rust","axum","tokio","serde","tracing"],"data":["sqlx","postgresql"],"testing":["cargo-test","proptest"]}
---

A starting choice, not a requirement: [[axum]] with [[sqlx]] and [[postgresql]]. Evaluate the alternative frameworks and database libraries in the Rust pack before exporting.
