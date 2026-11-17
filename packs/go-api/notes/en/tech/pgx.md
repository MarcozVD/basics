---
type: "tech"
kind: "library"
title: "pgx"
layer: "data"
language: "go"
use_when: ["Go PostgreSQL access using a native driver","Go service needing PostgreSQL-specific operations"]
avoid_when: ["SQLite is the required database","A database-independent entity model is required"]
performs_best: ["Explicit Go PostgreSQL queries and pooling choices"]
related: ["go","database-sql","sqlc","postgresql"]
practices: ["go-context","go-errors","go-concurrency"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","pgx"]
---

# pgx

pgx supplies a Go PostgreSQL driver with a native interface and a database/sql adapter. Choose the interface deliberately, use pgxpool when a pool is needed, and pass cancellation through queries and transactions. Test against PostgreSQL rather than a SQLite substitute.

Related notes: [[go]], [[database-sql]], [[sqlc]], [[postgresql]].

[Official reference](https://pkg.go.dev/github.com/jackc/pgx/v5).
