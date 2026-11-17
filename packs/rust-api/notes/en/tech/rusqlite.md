---
type: "tech"
kind: "library"
title: "rusqlite"
layer: "data"
language: "rust"
use_when: ["Rust applications embedding SQLite directly","Rust local persistence with synchronous queries"]
avoid_when: ["A shared remote database server is required","Unbounded blocking queries would run on async workers"]
performs_best: ["Direct SQLite access from Rust","Local database files and in-memory fixtures"]
related: ["rust","sqlite"]
practices: ["rust-data-access","rust-project-layout"]
checks: ["rust-clippy","rust-fmt","rust-tests"]
tags: ["rust","rusqlite"]
---

# rusqlite

rusqlite wraps SQLite with synchronous Rust APIs. Use bound parameters, define connection ownership and isolate blocking calls when serving asynchronous requests. Test file persistence as well as in-memory behavior.

Related notes: [[rust]], [[sqlite]].

Official reference: [rusqlite](https://docs.rs/rusqlite/latest/rusqlite/).
