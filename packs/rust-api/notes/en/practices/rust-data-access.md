---
type: "practice"
title: "Rust persistence boundaries"
applies_to: ["sqlx","diesel","sea-orm","rusqlite"]
---

# Rust persistence boundaries

Bind values rather than constructing SQL from request strings. Keep versioned migrations, explicit transactions and bounded connection pools. Test against the selected database engine; an in-memory [[sqlite]] fixture does not prove [[postgresql]] behavior. Run synchronous clients such as [[rusqlite]] behind an appropriate blocking boundary.

[Official reference](https://docs.rs/sqlx/latest/sqlx/).
